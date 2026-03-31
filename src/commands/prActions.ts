import * as vscode from 'vscode';
import { PullRequestItem, PullRequestTreeProvider } from '../prSidebar';
import {
    updateReviewerVote,
    completePullRequest,
    abandonPullRequest,
    addPullRequestComment,
    getPullRequestDetails,
    addReviewer,
    removeReviewer,
    getTeamMembers,
} from '../api';
import { getToken } from '../auth';
import { buildPullRequestUrl } from '../prLinks';

async function getContext(item: PullRequestItem, provider: PullRequestTreeProvider) {
    if (!item) {
        vscode.window.showErrorMessage('This command must be run from a pull request in the sidebar.');
        return undefined;
    }
    const pr = item.pr;
    const org = item.org;
    if (!pr || !org) {
        vscode.window.showErrorMessage('No pull request data available.');
        return undefined;
    }
    const token = await getToken(provider.secretStorage);
    if (!token) {
        vscode.window.showErrorMessage('No PAT configured.');
        return undefined;
    }
    const userId = provider.cachedUserId;
    if (!userId) {
        vscode.window.showErrorMessage('User ID not available. Try refreshing.');
        return undefined;
    }
    const project = pr.repository?.project?.name ?? '';
    const repoId = pr.repository?.id ?? '';
    return { pr, org, token, userId, project, repoId };
}

export function registerPrActions(
    context: vscode.ExtensionContext,
    provider: PullRequestTreeProvider
) {
    // Vote commands
    const voteCommands: Array<{ command: string; vote: number; label: string }> = [
        { command: 'azureDevops.approvePr', vote: 10, label: 'Approved' },
        { command: 'azureDevops.approveWithSuggestionsPr', vote: 5, label: 'Approved with suggestions' },
        { command: 'azureDevops.waitForAuthorPr', vote: -5, label: 'Waiting for author' },
        { command: 'azureDevops.rejectPr', vote: -10, label: 'Rejected' },
        { command: 'azureDevops.resetVotePr', vote: 0, label: 'Vote reset' },
    ];

    for (const { command, vote, label } of voteCommands) {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, async (item: PullRequestItem) => {
                const ctx = await getContext(item, provider);
                if (!ctx) { return; }
                try {
                    await updateReviewerVote(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, ctx.userId, vote, ctx.token);
                    vscode.window.showInformationMessage(`PR #${ctx.pr.pullRequestId}: ${label}`);
                    provider.refresh();
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to vote: ${e.message}`);
                }
            })
        );
    }

    // Complete PR
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.completePr', async (item: PullRequestItem) => {
            const ctx = await getContext(item, provider);
            if (!ctx) { return; }
            const confirm = await vscode.window.showWarningMessage(
                `Complete PR #${ctx.pr.pullRequestId} "${ctx.pr.title}"?`,
                { modal: true }, 'Complete'
            );
            if (confirm !== 'Complete') { return; }
            try {
                // Get latest PR details for lastMergeSourceCommit
                const details = await getPullRequestDetails(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, ctx.token);
                const commitId = details.lastMergeSourceCommit?.commitId;
                if (!commitId) {
                    vscode.window.showErrorMessage('Cannot complete: no merge source commit found.');
                    return;
                }
                await completePullRequest(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, commitId, ctx.token);
                vscode.window.showInformationMessage(`PR #${ctx.pr.pullRequestId} completed.`);
                provider.refresh();
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to complete PR: ${e.message}`);
            }
        })
    );

    // Abandon PR
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.abandonPr', async (item: PullRequestItem) => {
            const ctx = await getContext(item, provider);
            if (!ctx) { return; }
            const confirm = await vscode.window.showWarningMessage(
                `Abandon PR #${ctx.pr.pullRequestId} "${ctx.pr.title}"?`,
                { modal: true }, 'Abandon'
            );
            if (confirm !== 'Abandon') { return; }
            try {
                await abandonPullRequest(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, ctx.token);
                vscode.window.showInformationMessage(`PR #${ctx.pr.pullRequestId} abandoned.`);
                provider.refresh();
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to abandon PR: ${e.message}`);
            }
        })
    );

    // Add comment
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.addCommentPr', async (item: PullRequestItem) => {
            const ctx = await getContext(item, provider);
            if (!ctx) { return; }
            const comment = await vscode.window.showInputBox({
                prompt: `Add comment to PR #${ctx.pr.pullRequestId}`,
                placeHolder: 'Type your comment...',
            });
            if (!comment) { return; }
            try {
                await addPullRequestComment(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, comment, ctx.token);
                vscode.window.showInformationMessage('Comment added.');
                provider.refresh();
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to add comment: ${e.message}`);
            }
        })
    );

    // Open in browser (explicit command)
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.openPrInBrowser', async (item: PullRequestItem) => {
            const pr = item.pr;
            const org = item.org;
            if (!pr || !org) { return; }
            const project = pr.repository?.project?.name ?? '';
            const repoName = pr.repository?.name ?? '';
            const prUrl = buildPullRequestUrl(org, project, repoName, pr.pullRequestId);
            vscode.env.openExternal(vscode.Uri.parse(prUrl));
        })
    );

    // Manage Reviewers
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.manageReviewersPr', async (item: PullRequestItem) => {
            const ctx = await getContext(item, provider);
            if (!ctx) { return; }
            try {
                // Fetch latest PR details to get current reviewers
                const details = await getPullRequestDetails(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, ctx.token);
                const currentReviewers = details.reviewers ?? [];
                const currentReviewerIds = new Set(currentReviewers.map(r => r.id));

                // Fetch team members as candidates
                const teamMembers = await getTeamMembers(ctx.org, ctx.project, ctx.token);

                // Merge current reviewers and team members into a single candidate list
                const candidateMap = new Map<string, { id: string; displayName: string }>();
                for (const member of teamMembers) {
                    candidateMap.set(member.id, member);
                }
                // Ensure current reviewers are always in the list
                for (const reviewer of currentReviewers) {
                    if (!candidateMap.has(reviewer.id)) {
                        candidateMap.set(reviewer.id, { id: reviewer.id, displayName: reviewer.displayName });
                    }
                }

                const candidates = Array.from(candidateMap.values())
                    .sort((a, b) => a.displayName.localeCompare(b.displayName));

                if (candidates.length === 0) {
                    vscode.window.showInformationMessage('No team members found to add as reviewers.');
                    return;
                }

                // Show multi-select quick pick with current reviewers pre-selected
                const items: vscode.QuickPickItem[] = candidates.map(c => ({
                    label: c.displayName,
                    description: currentReviewerIds.has(c.id) ? 'Current reviewer' : '',
                    picked: currentReviewerIds.has(c.id),
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select reviewers for this pull request',
                    title: `Manage Reviewers — PR #${ctx.pr.pullRequestId}`,
                });

                if (!selected) { return; }

                // Build name-to-id lookup for O(1) resolution
                const nameToId = new Map(candidates.map(c => [c.displayName, c.id]));
                const selectedIds = new Set(
                    selected.map(s => nameToId.get(s.label))
                        .filter((id): id is string => !!id)
                );

                // Add new reviewers
                const toAdd = candidates.filter(c => selectedIds.has(c.id) && !currentReviewerIds.has(c.id));
                // Remove deselected reviewers
                const toRemove = currentReviewers.filter(r => !selectedIds.has(r.id));

                for (const reviewer of toAdd) {
                    await addReviewer(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, reviewer.id, ctx.token);
                }
                for (const reviewer of toRemove) {
                    await removeReviewer(ctx.org, ctx.project, ctx.repoId, ctx.pr.pullRequestId, reviewer.id, ctx.token);
                }

                const changes: string[] = [];
                if (toAdd.length > 0) { changes.push(`added ${toAdd.length}`); }
                if (toRemove.length > 0) { changes.push(`removed ${toRemove.length}`); }

                if (changes.length > 0) {
                    vscode.window.showInformationMessage(`Reviewers updated: ${changes.join(', ')}.`);
                    provider.refresh();
                } else {
                    vscode.window.showInformationMessage('No reviewer changes made.');
                }
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to manage reviewers: ${e.message}`);
            }
        })
    );
}

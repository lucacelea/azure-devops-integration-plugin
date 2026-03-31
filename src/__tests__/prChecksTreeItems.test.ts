import * as vscode from 'vscode';
import { PullRequestItem } from '../prSidebar';
import { EnrichedPullRequest, PolicyCheck } from '../api';

function makePr(overrides: Partial<EnrichedPullRequest> = {}): EnrichedPullRequest {
    return {
        pullRequestId: 1,
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature',
        createdBy: { displayName: 'User', id: 'user1' },
        reviewers: [],
        repository: { id: 'repo1', name: 'repo', project: { id: 'proj1', name: 'proj' } },
        status: 'active',
        isDraft: false,
        url: '',
        unresolvedCommentCount: 0,
        commentThreads: [],
        checksStatus: 'none',
        checks: [],
        ...overrides,
    };
}

describe('PullRequestItem.fromPullRequest with checks', () => {
    it('creates a non-expandable item when there are no checks', () => {
        const pr = makePr({ checks: [] });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        expect(item.children).toBeUndefined();
    });

    it('creates an expandable item when there are checks', () => {
        const checks: PolicyCheck[] = [
            { name: 'Build Validation', status: 'approved', isBlocking: true },
            { name: 'Code Coverage', status: 'rejected', isBlocking: true },
        ];
        const pr = makePr({ checks, checksStatus: 'failed' });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        expect(item.children).toHaveLength(2);
    });

    it('preserves the pullRequest contextValue on the PR item', () => {
        const checks: PolicyCheck[] = [
            { name: 'Build', status: 'approved', isBlocking: true },
        ];
        const pr = makePr({ checks });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.contextValue).toBe('pullRequest');
    });

    it('does not include checks text in the tooltip', () => {
        const pr = makePr({ checksStatus: 'failed', checks: [{ name: 'Build', status: 'rejected', isBlocking: true }] });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');
        const tooltipText = (item.tooltip as vscode.MarkdownString).value;

        expect(tooltipText).not.toContain('Checks:');
    });
});

describe('PullRequestItem.fromCheck', () => {
    it('creates a tree item for an approved check', () => {
        const check: PolicyCheck = { name: 'Build Validation', status: 'approved', isBlocking: true };
        const item = PullRequestItem.fromCheck(check);

        expect(item.label).toBe('Build Validation');
        expect(item.description).toBe('Passed');
        expect(item.contextValue).toBe('policyCheck');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        expect((item.iconPath as vscode.ThemeIcon).id).toBe('pass');
        expect((item.iconPath as vscode.ThemeIcon).color).toEqual(new vscode.ThemeColor('testing.iconPassed'));
    });

    it('creates a tree item for a rejected check', () => {
        const check: PolicyCheck = { name: 'Build', status: 'rejected', isBlocking: true };
        const item = PullRequestItem.fromCheck(check);

        expect(item.description).toBe('Failed');
        expect((item.iconPath as vscode.ThemeIcon).id).toBe('error');
        expect((item.iconPath as vscode.ThemeIcon).color).toEqual(new vscode.ThemeColor('testing.iconFailed'));
    });

    it('creates a tree item for a broken check', () => {
        const check: PolicyCheck = { name: 'Lint', status: 'broken', isBlocking: false };
        const item = PullRequestItem.fromCheck(check);

        expect(item.description).toBe('Failed');
        expect((item.iconPath as vscode.ThemeIcon).id).toBe('error');
    });

    it('creates a tree item for a running check', () => {
        const check: PolicyCheck = { name: 'Tests', status: 'running', isBlocking: true };
        const item = PullRequestItem.fromCheck(check);

        expect(item.description).toBe('Running');
        expect((item.iconPath as vscode.ThemeIcon).id).toBe('loading~spin');
        expect((item.iconPath as vscode.ThemeIcon).color).toEqual(new vscode.ThemeColor('warningForeground'));
    });

    it('creates a tree item for a queued check', () => {
        const check: PolicyCheck = { name: 'Deploy', status: 'queued', isBlocking: true };
        const item = PullRequestItem.fromCheck(check);

        expect(item.description).toBe('Running');
        expect((item.iconPath as vscode.ThemeIcon).id).toBe('loading~spin');
    });

    it('creates a tree item for a notApplicable check', () => {
        const check: PolicyCheck = { name: 'Optional', status: 'notApplicable', isBlocking: false };
        const item = PullRequestItem.fromCheck(check);

        expect(item.description).toBe('N/A');
        expect((item.iconPath as vscode.ThemeIcon).id).toBe('circle-slash');
        expect((item.iconPath as vscode.ThemeIcon).color).toEqual(new vscode.ThemeColor('disabledForeground'));
    });

    it('sets a click command when pipelineUrl is provided', () => {
        const check: PolicyCheck = {
            name: 'Build',
            status: 'approved',
            isBlocking: true,
            pipelineUrl: 'https://dev.azure.com/myorg/myproj/_build/results?buildId=123',
        };
        const item = PullRequestItem.fromCheck(check);

        expect(item.command).toBeDefined();
        expect(item.command!.command).toBe('azureDevops.openCheckInBrowser');
        expect(item.command!.arguments).toEqual(['https://dev.azure.com/myorg/myproj/_build/results?buildId=123']);
    });

    it('does not set a click command when pipelineUrl is absent', () => {
        const check: PolicyCheck = { name: 'Required Reviewer', status: 'approved', isBlocking: true };
        const item = PullRequestItem.fromCheck(check);

        expect(item.command).toBeUndefined();
    });
});

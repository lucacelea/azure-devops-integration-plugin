import * as vscode from "vscode";
import {
  EnrichedPullRequest,
  getPullRequestDetails,
  PullRequestDetails,
  updatePullRequestDescription,
} from "../api";
import { getToken } from "../auth";
import { PullRequestItem, PullRequestTreeProvider } from "../prSidebar";
import { editMarkdownViaTempFile } from "../tempMarkdownEditor";

interface ResolvedPullRequestContext {
  pr: EnrichedPullRequest;
  org: string;
  project: string;
  repoId: string;
  token: string;
}

function buildQuickPickLabel(pr: EnrichedPullRequest): {
  label: string;
  description: string;
  detail: string;
} {
  const branch = pr.sourceRefName?.replace(/^refs\/heads\//, "") ?? "";
  return {
    label: pr.title,
    description: `#${pr.pullRequestId} · ${pr.repository?.name ?? "Unknown repo"}`,
    detail: branch ? `Branch: ${branch}` : "",
  };
}

async function resolvePullRequestContext(
  provider: PullRequestTreeProvider,
  item?: PullRequestItem,
): Promise<ResolvedPullRequestContext | undefined> {
  const token = await getToken(provider.secretStorage);
  if (!token) {
    vscode.window.showErrorMessage("No PAT configured.");
    return undefined;
  }

  if (item?.pr && item.org) {
    const project = item.pr.repository?.project?.name ?? "";
    const repoId = item.pr.repository?.id ?? "";
    if (!project || !repoId) {
      vscode.window.showErrorMessage("No pull request data available.");
      return undefined;
    }

    return {
      pr: item.pr,
      org: item.org,
      project,
      repoId,
      token,
    };
  }

  const authored = await provider.getCreatedByMePullRequests();
  if (!authored) {
    vscode.window.showErrorMessage("Failed to fetch your pull requests.");
    return undefined;
  }

  if (authored.pullRequests.length === 0) {
    vscode.window.showInformationMessage("No pull requests created by you.");
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(
    authored.pullRequests.map((pr) => ({
      ...buildQuickPickLabel(pr),
      pr,
    })),
    { placeHolder: "Select a pull request to edit its description" },
  );
  if (!selected) {
    return undefined;
  }

  const project = selected.pr.repository?.project?.name ?? "";
  const repoId = selected.pr.repository?.id ?? "";
  if (!project || !repoId) {
    vscode.window.showErrorMessage("No pull request data available.");
    return undefined;
  }

  return {
    pr: selected.pr,
    org: authored.org,
    project,
    repoId,
    token,
  };
}

export async function editExistingPrDescription(
  provider: PullRequestTreeProvider,
  item?: PullRequestItem,
): Promise<void> {
  const context = await resolvePullRequestContext(provider, item);
  if (!context) {
    return;
  }

  try {
    const details = (await getPullRequestDetails(
      context.org,
      context.project,
      context.repoId,
      context.pr.pullRequestId,
      context.token,
    )) as PullRequestDetails;
    const currentDescription = details.description ?? "";

    const editedDescription = await editMarkdownViaTempFile(currentDescription, {
      infoMessage:
        "Edit the PR description, then close the tab to submit.",
      openWhenEmpty: true,
      filePrefix: `pr-${context.pr.pullRequestId}-description`,
      showCancellableNotification: "Editing PR description — close the tab to submit, or click Cancel to abort.",
      cancelActionLabel: "Cancel",
    });

    if (editedDescription === undefined) {
      return;
    }

    if (editedDescription === currentDescription.trim()) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Updating PR #${context.pr.pullRequestId} description...`,
      },
      () =>
        updatePullRequestDescription(
          context.org,
          context.project,
          context.repoId,
          context.pr.pullRequestId,
          editedDescription,
          context.token,
        ),
    );

    vscode.window.showInformationMessage(
      `PR #${context.pr.pullRequestId} description updated.`,
    );
    provider.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to update PR description: ${error instanceof Error ? error.message : error}`,
    );
  }
}

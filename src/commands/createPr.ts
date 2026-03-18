import * as vscode from "vscode";
import { readFile, writeFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import * as path from "path";
import * as os from "os";
import { getDevOpsConfig, getBaseUrl, getWorkItemProject } from "../config";
import { getCurrentBranch, getDefaultBranch, getRepositoryRoot } from "../git";
import { getWorkItemId } from "../workItem";
import { getToken } from "../auth";
import {
  createPullRequestApi,
  getAssignedWorkItems,
  getRepositoryId,
  getUserId,
  setAutoComplete,
  updateWorkItemState,
  WorkItem,
} from "../api";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCfHtml(fragment: string): string {
  const header =
    "Version:1.0\r\nStartHTML:AAAAAAAAAA\r\nEndHTML:BBBBBBBBBB\r\n" +
    "StartFragment:CCCCCCCCCC\r\nEndFragment:DDDDDDDDDD\r\n";
  const prefix = "<html><body>\r\n<!--StartFragment-->";
  const suffix = "<!--EndFragment-->\r\n</body></html>";

  const startHtml = header.length;
  const startFragment = startHtml + prefix.length;
  const endFragment = startFragment + Buffer.byteLength(fragment, "utf-8");
  const endHtml = endFragment + suffix.length;

  return (
    header
      .replace("AAAAAAAAAA", startHtml.toString().padStart(10, "0"))
      .replace("BBBBBBBBBB", endHtml.toString().padStart(10, "0"))
      .replace("CCCCCCCCCC", startFragment.toString().padStart(10, "0"))
      .replace("DDDDDDDDDD", endFragment.toString().padStart(10, "0")) +
    prefix +
    fragment +
    suffix
  );
}

async function copyRichLink(
  url: string,
  linkText: string,
  suffix: string,
): Promise<void> {
  const html = `<a href="${escapeHtml(url)}">${escapeHtml(linkText)}</a>${escapeHtml(suffix)}`;
  const plainText = `${linkText}${suffix} ${url}`;

  if (process.platform === "win32") {
    try {
      const cfHtml = buildCfHtml(html);
      const b64Html = Buffer.from(cfHtml, "utf-8").toString("base64");
      const b64Text = Buffer.from(plainText, "utf-8").toString("base64");

      const psScript = [
        "Add-Type -AssemblyName PresentationCore",
        `$h=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Html}'))`,
        `$t=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Text}'))`,
        "$d=New-Object System.Windows.DataObject",
        "$d.SetData([System.Windows.DataFormats]::Html,$h)",
        "$d.SetData([System.Windows.DataFormats]::UnicodeText,$t)",
        "[System.Windows.Clipboard]::SetDataObject($d,$true)",
      ].join(";");

      await new Promise<void>((resolve, reject) => {
        execFile(
          "powershell",
          ["-NoProfile", "-NonInteractive", "-Command", psScript],
          { timeout: 5000 },
          (err) => (err ? reject(err) : resolve()),
        );
      });
      return;
    } catch {
      // Fall back to plain text
    }
  }

  await vscode.env.clipboard.writeText(plainText);
}

async function getPullRequestTemplate(): Promise<string | undefined> {
  const repoRoot = await getRepositoryRoot();
  if (!repoRoot) {
    return undefined;
  }

  const templatePaths = [
    ".azuredevops/pull_request_template.md",
    ".azuredevops/PULL_REQUEST_TEMPLATE.md",
    ".azuredevops/pull_request_template.txt",
    "pull_request_template.md",
    "PULL_REQUEST_TEMPLATE.md",
  ];

  for (const templatePath of templatePaths) {
    try {
      const content = await readFile(
        path.join(repoRoot, templatePath),
        "utf-8",
      );
      if (content.trim()) {
        return content;
      }
    } catch {
      // Try next candidate.
    }
  }

  return undefined;
}

export function appendWorkItemsToTemplate(
  template: string | undefined,
  workItemTitles: string[],
): string | undefined {
  if (workItemTitles.length === 0) {
    return template;
  }

  const workItemSection = workItemTitles.join("\n");
  if (!template) {
    return workItemSection;
  }

  return `${template.trimEnd()}\n\n${workItemSection}`;
}

async function editPullRequestDescription(template?: string): Promise<string> {
  if (!template) {
    return "";
  }

  const tmpPath = path.join(os.tmpdir(), `pr-description-${Date.now()}.md`);
  await writeFile(tmpPath, template, "utf-8");

  const tmpUri = vscode.Uri.file(tmpPath);
  // Use the URI-normalized path for comparisons so that drive-letter
  // casing differences on Windows (C:\ vs c:\) don't cause mismatches.
  const normalizedPath = tmpUri.fsPath;
  const doc = await vscode.workspace.openTextDocument(tmpUri);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    "Edit the PR description, then close the tab to submit. Clear all text to skip.",
  );

  let latestContent = template;

  // Auto-save on changes so closing the tab never prompts to save
  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (
      e.document.uri.fsPath === normalizedPath &&
      e.contentChanges.length > 0
    ) {
      latestContent = e.document.getText();
      e.document.save();
    }
  });

  // Use tabGroups.onDidChangeTabs for reliable tab-close detection
  // (onDidCloseTextDocument is not guaranteed to fire on tab close)
  return new Promise<string>((resolve) => {
    const tabDisposable = vscode.window.tabGroups.onDidChangeTabs(async (e) => {
      for (const tab of e.closed) {
        if (
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.fsPath === normalizedPath
        ) {
          tabDisposable.dispose();
          changeDisposable.dispose();
          resolve(latestContent.trim() || "");
          await unlink(tmpPath).catch(() => {});
          return;
        }
      }
    });
  });
}

export async function createPullRequest(
  secretStorage: vscode.SecretStorage,
): Promise<void> {
  try {
    let config;
    try {
      config = await getDevOpsConfig();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to get Azure DevOps configuration: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }

    const token = await getToken(secretStorage);
    if (!token) {
      vscode.window.showErrorMessage(
        "No PAT configured. Please set your Personal Access Token first.",
      );
      return;
    }

    const branch = await getCurrentBranch();
    if (!branch) {
      vscode.window.showErrorMessage(
        "Could not determine the current Git branch.",
      );
      return;
    }

    const defaultBranch = await getDefaultBranch();
    if (branch === defaultBranch) {
      const choice = await vscode.window.showWarningMessage(
        `You are currently on the default branch "${defaultBranch}". Are you sure you want to create a pull request?`,
        "Continue",
        "Cancel",
      );
      if (choice !== "Continue") {
        return;
      }
    }

    // Gather PR details
    const workItemId = await getWorkItemId();
    const parsedWorkItemId = workItemId ? parseInt(workItemId, 10) : undefined;
    const hasValidWorkItemId =
      parsedWorkItemId !== undefined && !Number.isNaN(parsedWorkItemId);
    const workItemState = vscode.workspace
      .getConfiguration("azureDevops")
      .get<string>("pullRequestLinkedWorkItemState", "")
      .trim();

    const defaultTitle = branch
      .replace(/^(?:feature|bugfix|hotfix|fix|task|chore)\//, "")
      .replace(/^\d+[-_]?/, hasValidWorkItemId ? `AB#${parsedWorkItemId} ` : "")
      .replace(/[-_]/g, " ")
      .trim();

    const title = await vscode.window.showInputBox({
      prompt: "Pull request title",
      value: defaultTitle || branch,
    });
    if (!title) {
      return;
    }

    const targetBranch = await vscode.window.showInputBox({
      prompt: "Target branch",
      value: defaultBranch,
    });
    if (!targetBranch) {
      return;
    }

    const isDraft = await vscode.window.showQuickPick(
      [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
      { placeHolder: "Create as draft?" },
    );
    if (!isDraft) {
      return;
    }

    // Work item selection
    let selectedWorkItemIds: number[] = hasValidWorkItemId
      ? [parsedWorkItemId]
      : [];
    let selectedWorkItemTitles: string[] = [];
    let workItemProject: string | undefined;

    const showWorkItemPicker = vscode.workspace
      .getConfiguration("azureDevops")
      .get<boolean>("showAssignedWorkItems", true);

    if (showWorkItemPicker) {
      try {
        workItemProject = await getWorkItemProject();
        const assignedWorkItems = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Fetching assigned work items...",
          },
          () =>
            getAssignedWorkItems(config.organization, workItemProject!, token),
        );

        if (assignedWorkItems.length > 0) {
          const quickPickItems = assignedWorkItems.map((wi: WorkItem) => ({
            label: `#${wi.id} ${wi.title}`,
            description: `${wi.type} · ${wi.state}`,
            picked: selectedWorkItemIds.includes(wi.id),
            workItemId: wi.id,
            workItemTitle: wi.title,
          }));

          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: "Select work items to link to this pull request",
            canPickMany: true,
          });

          if (selected === undefined) {
            return;
          }
          selectedWorkItemIds = selected.map(
            (s: { workItemId: number }) => s.workItemId,
          );
          selectedWorkItemTitles = selected.map(
            (s: { workItemTitle: string }) => s.workItemTitle,
          );
        }
      } catch (error) {
        vscode.window.showWarningMessage(
          `Could not fetch assigned work items: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const template = await getPullRequestTemplate();
    const templateWithWorkItems = appendWorkItemsToTemplate(
      template,
      selectedWorkItemTitles,
    );
    const description = await editPullRequestDescription(templateWithWorkItems);

    // Create via API
    const pr = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Creating pull request...",
      },
      async () => {
        const repoId = await getRepositoryId(
          config.organization,
          config.project,
          config.repository,
          token,
        );

        const result = await createPullRequestApi({
          org: config.organization,
          project: config.project,
          repoId,
          sourceRefName: `refs/heads/${branch}`,
          targetRefName: `refs/heads/${targetBranch}`,
          title,
          description,
          workItemIds:
            selectedWorkItemIds.length > 0 ? selectedWorkItemIds : undefined,
          isDraft: isDraft.value,
          token,
        });

        if (selectedWorkItemIds.length > 0 && workItemState) {
          const wiProject = workItemProject ?? (await getWorkItemProject());
          for (const wiId of selectedWorkItemIds) {
            try {
              await updateWorkItemState(
                config.organization,
                wiProject,
                wiId,
                workItemState,
                token,
              );
            } catch (error) {
              vscode.window.showWarningMessage(
                `PR created, but failed to set linked work item #${wiId} state to "${workItemState}": ${error instanceof Error ? error.message : error}`,
              );
            }
          }
        }

        const settings = vscode.workspace.getConfiguration("azureDevops");
        if (
          settings.get<boolean>("pullRequestAutoComplete", false) &&
          !isDraft.value
        ) {
          try {
            const userId = await getUserId(config.organization, token);
            await setAutoComplete(
              config.organization,
              config.project,
              repoId,
              result.pullRequestId,
              userId,
              {
                mergeStrategy: settings.get<"squash">(
                  "pullRequestMergeStrategy",
                  "squash",
                ),
                deleteSourceBranch: settings.get<boolean>(
                  "pullRequestDeleteSourceBranch",
                  true,
                ),
                completeWorkItems: settings.get<boolean>(
                  "pullRequestCompleteWorkItems",
                  true,
                ),
              },
              token,
            );
          } catch (error) {
            vscode.window.showWarningMessage(
              `PR created, but failed to set auto-complete: ${error instanceof Error ? error.message : error}`,
            );
          }
        }

        return result;
      },
    );

    const prUrl = `${getBaseUrl(config)}/pullrequest/${pr.pullRequestId}`;

    const autoOpen = vscode.workspace
      .getConfiguration("azureDevops")
      .get<boolean>("pullRequestAutoOpenInBrowser", false);

    if (autoOpen) {
      await vscode.env.openExternal(vscode.Uri.parse(prUrl));
    }

    const action = await vscode.window.showInformationMessage(
      `PR #${pr.pullRequestId} created.`,
      "Copy URL",
      "Open in Browser",
    );
    if (action === "Copy URL") {
      await copyRichLink(
        prUrl,
        `Pull Request ${pr.pullRequestId}`,
        `: ${title}`,
      );
      vscode.window.showInformationMessage("PR URL copied to clipboard.");
    } else if (action === "Open in Browser") {
      await vscode.env.openExternal(vscode.Uri.parse(prUrl));
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create pull request: ${error instanceof Error ? error.message : error}`,
    );
  }
}

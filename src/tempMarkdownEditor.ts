import * as vscode from "vscode";
import { unlink, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface TempMarkdownEditorOptions {
  infoMessage?: string;
  openWhenEmpty?: boolean;
  filePrefix?: string;
  confirmActionLabel?: string;
  cancelActionLabel?: string;
  showCancellableNotification?: string;
}

export interface TempEditorCancelPromptOptions {
  infoAction: string;
  cancelLabel: string;
}

export function buildTempEditorCancelPrompt(
  options: TempEditorCancelPromptOptions,
): Pick<TempMarkdownEditorOptions, 'infoMessage' | 'confirmActionLabel' | 'cancelActionLabel'> {
  return {
    infoMessage: `Open the PR description in a temporary tab. Close that tab to continue, or cancel ${options.infoAction} now.`,
    confirmActionLabel: "Open Editor",
    cancelActionLabel: options.cancelLabel,
  };
}

export async function editMarkdownViaTempFile(
  initialContent: string,
  options?: TempMarkdownEditorOptions,
): Promise<string | undefined> {
  if (!initialContent && options?.openWhenEmpty === false) {
    return "";
  }

  if (options?.infoMessage && options.cancelActionLabel && !options.showCancellableNotification) {
    const confirmAction = options.confirmActionLabel ?? "Open Editor";
    const selectedAction = await vscode.window.showInformationMessage(
      options.infoMessage,
      confirmAction,
      options.cancelActionLabel,
    );

    if (selectedAction !== confirmAction) {
      return undefined;
    }
  }

  const tmpPath = path.join(
    os.tmpdir(),
    `${options?.filePrefix ?? "pr-description"}-${Date.now()}.md`,
  );
  await writeFile(tmpPath, initialContent, "utf-8");

  const tmpUri = vscode.Uri.file(tmpPath);
  const normalizedPath = tmpUri.fsPath;
  const doc = await vscode.workspace.openTextDocument(tmpUri);
  await vscode.window.showTextDocument(doc);

  if (options?.infoMessage && !options.cancelActionLabel) {
    void vscode.window.showInformationMessage(options.infoMessage);
  }

  let latestContent = initialContent;
  let wasCancelled = false;
  let isFinished = false;

  const finish = async (result: string | undefined): Promise<void> => {
    if (isFinished) {
      return;
    }

    isFinished = true;
    changeDisposable.dispose();
    resolvePromise?.(result);
    await unlink(tmpPath).catch(() => {});
  };

  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (
      e.document.uri.fsPath === normalizedPath &&
      e.contentChanges.length > 0
    ) {
      latestContent = e.document.getText();
      e.document.save();
    }
  });

  let resolvePromise: ((value: string | undefined) => void) | undefined;

  return new Promise<string | undefined>((resolve) => {
    resolvePromise = resolve;

    if (options?.showCancellableNotification) {
      vscode.window.showInformationMessage(
        options.showCancellableNotification,
        options.cancelActionLabel || "Cancel",
      ).then((result) => {
        if (result === (options.cancelActionLabel || "Cancel")) {
          wasCancelled = true;
          void vscode.window.showTextDocument(doc).then(async () => {
            await vscode.commands.executeCommand(
              "workbench.action.closeActiveEditor",
            );
          });
        }
      });
    }

    const tabDisposable = vscode.window.tabGroups.onDidChangeTabs(async (e) => {
      for (const tab of e.closed) {
        if (
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.fsPath === normalizedPath
        ) {
          tabDisposable.dispose();
          await finish(wasCancelled ? undefined : latestContent.trim());
          return;
        }
      }
    });
  });
}

import * as vscode from "vscode";
import { unlink, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface TempMarkdownEditorOptions {
  infoMessage?: string;
  openWhenEmpty?: boolean;
  filePrefix?: string;
}

export async function editMarkdownViaTempFile(
  initialContent: string,
  options?: TempMarkdownEditorOptions,
): Promise<string> {
  if (!initialContent && options?.openWhenEmpty === false) {
    return "";
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

  vscode.window.showInformationMessage(
    options?.infoMessage ??
      "Edit the markdown content, then close the tab to submit.",
  );

  let latestContent = initialContent;

  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (
      e.document.uri.fsPath === normalizedPath &&
      e.contentChanges.length > 0
    ) {
      latestContent = e.document.getText();
      e.document.save();
    }
  });

  return new Promise<string>((resolve) => {
    const tabDisposable = vscode.window.tabGroups.onDidChangeTabs(async (e) => {
      for (const tab of e.closed) {
        if (
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.fsPath === normalizedPath
        ) {
          tabDisposable.dispose();
          changeDisposable.dispose();
          resolve(latestContent.trim());
          await unlink(tmpPath).catch(() => {});
          return;
        }
      }
    });
  });
}

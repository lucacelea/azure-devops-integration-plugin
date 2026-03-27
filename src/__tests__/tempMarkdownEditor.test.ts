import * as vscode from "vscode";
import { editMarkdownViaTempFile } from "../tempMarkdownEditor";

jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const mockDoc = { getText: jest.fn().mockReturnValue(""), save: jest.fn(), uri: { fsPath: "/tmp/pr-description-123.md" } };

describe("editMarkdownViaTempFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(mockDoc);
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.workspace.onDidChangeTextDocument as jest.Mock).mockReturnValue({ dispose: jest.fn() });
    (vscode.window.tabGroups.onDidChangeTabs as jest.Mock).mockImplementation((cb: (e: { closed: { input: vscode.TabInputText }[] }) => void) => {
      // Defer to next microtask so tabDisposable is assigned before the callback fires
      Promise.resolve().then(() => cb({ closed: [{ input: new vscode.TabInputText({ fsPath: "/tmp/pr-description-123.md" } as unknown as vscode.Uri) }] }));
      return { dispose: jest.fn() };
    });
  });

  it("returns empty string immediately without opening editor when openWhenEmpty is false and content is empty", async () => {
    const result = await editMarkdownViaTempFile("", { openWhenEmpty: false });

    expect(result).toBe("");
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
  });

  it("opens the editor even when initial content is empty and openWhenEmpty is not false", async () => {
    // Override Uri.file to return a stable fsPath
    const origFile = vscode.Uri.file;
    (vscode.Uri as any).file = jest.fn().mockReturnValue({ fsPath: "/tmp/pr-description-123.md" });

    try {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce("Open Editor");
      const result = await editMarkdownViaTempFile("", {
        infoMessage: "Edit the PR description, then close the tab to submit. Clear all text to skip.",
        confirmActionLabel: "Open Editor",
        cancelActionLabel: "Cancel Create PR",
      });

      expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
      expect(typeof result).toBe("string");
    } finally {
      (vscode.Uri as any).file = origFile;
    }
  });

  it("opens the editor when content is non-empty", async () => {
    const origFile = vscode.Uri.file;
    (vscode.Uri as any).file = jest.fn().mockReturnValue({ fsPath: "/tmp/pr-description-123.md" });

    try {
      await editMarkdownViaTempFile("Some template content", {
        infoMessage: "Edit the PR description, then close the tab to submit. Clear all text to skip.",
      });

      expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    } finally {
      (vscode.Uri as any).file = origFile;
    }
  });

  it("returns undefined without opening the editor when the cancel action is chosen", async () => {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      "Cancel Create PR",
    );

    const result = await editMarkdownViaTempFile("Some template content", {
      infoMessage:
        "Open the PR description in a temporary tab. Close that tab to continue, or cancel PR creation now.",
      confirmActionLabel: "Open Editor",
      cancelActionLabel: "Cancel Create PR",
    });

    expect(result).toBeUndefined();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
  });

  it("closes the temp editor when cancel is clicked during editing", async () => {
    const origFile = vscode.Uri.file;
    let onDidChangeTabsCallback:
      | ((e: { closed: { input: vscode.TabInputText }[] }) => void)
      | undefined;

    (vscode.Uri as any).file = jest
      .fn()
      .mockReturnValue({ fsPath: "/tmp/pr-description-123.md" });
    (vscode.window.showInformationMessage as jest.Mock)
      .mockResolvedValueOnce("Cancel")
      .mockResolvedValueOnce(undefined);
    (vscode.window.tabGroups.onDidChangeTabs as jest.Mock).mockImplementation(
      (cb: (e: { closed: { input: vscode.TabInputText }[] }) => void) => {
        onDidChangeTabsCallback = cb;
        return { dispose: jest.fn() };
      },
    );
    (vscode.commands.executeCommand as jest.Mock).mockImplementation(
      async (command: string) => {
        if (command === "workbench.action.closeActiveEditor") {
          onDidChangeTabsCallback?.({
            closed: [
              {
                input: new vscode.TabInputText(
                  { fsPath: "/tmp/pr-description-123.md" } as unknown as vscode.Uri,
                ),
              },
            ],
          });
        }
      },
    );

    try {
      const result = await editMarkdownViaTempFile("Some template content", {
        infoMessage: "Edit the PR description, then close the tab to submit.",
        showCancellableNotification:
          "Editing PR description - close the tab to submit, or click Cancel to abort.",
        cancelActionLabel: "Cancel",
      });

      expect(result).toBeUndefined();
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.closeActiveEditor",
      );
      expect(vscode.window.showTextDocument).toHaveBeenCalledTimes(2);
    } finally {
      (vscode.Uri as any).file = origFile;
    }
  });
});

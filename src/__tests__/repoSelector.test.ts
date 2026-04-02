import * as vscode from "vscode";
import {
  getActiveWorkspaceFolder,
  selectRepository,
  resetActiveFolder,
} from "../repoSelector";

describe("repoSelector", () => {
  beforeEach(() => {
    resetActiveFolder();
    jest.clearAllMocks();
  });

  describe("getActiveWorkspaceFolder", () => {
    it("returns undefined when no workspace folders exist", () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      expect(getActiveWorkspaceFolder()).toBeUndefined();
    });

    it("returns undefined when workspace folders array is empty", () => {
      (vscode.workspace as any).workspaceFolders = [];
      expect(getActiveWorkspaceFolder()).toBeUndefined();
    });

    it("returns the only folder in a single-folder workspace", () => {
      const folder = { uri: { fsPath: "/repo1" }, name: "repo1", index: 0 };
      (vscode.workspace as any).workspaceFolders = [folder];
      expect(getActiveWorkspaceFolder()).toBe(folder);
    });

    it("returns the first folder by default in a multi-root workspace", () => {
      const folder1 = { uri: { fsPath: "/repo1" }, name: "repo1", index: 0 };
      const folder2 = { uri: { fsPath: "/repo2" }, name: "repo2", index: 1 };
      (vscode.workspace as any).workspaceFolders = [folder1, folder2];
      expect(getActiveWorkspaceFolder()).toBe(folder1);
    });
  });

  describe("selectRepository", () => {
    it("shows an error when no workspace folders exist", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      const result = await selectRepository();
      expect(result).toBeUndefined();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace folders open.",
      );
    });

    it("shows info message when only one folder exists", async () => {
      const folder = { uri: { fsPath: "/repo1" }, name: "repo1", index: 0 };
      (vscode.workspace as any).workspaceFolders = [folder];
      const result = await selectRepository();
      expect(result).toBe(folder);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Only one repository is open.",
      );
    });

    it("shows quick pick with multiple folders and returns selected", async () => {
      const folder1 = { uri: { fsPath: "/repo1" }, name: "repo1", index: 0 };
      const folder2 = { uri: { fsPath: "/repo2" }, name: "repo2", index: 1 };
      (vscode.workspace as any).workspaceFolders = [folder1, folder2];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: "repo2",
        description: "/repo2",
        folder: folder2,
      });

      const result = await selectRepository();
      expect(result).toBe(folder2);
      expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);

      // After selecting, getActiveWorkspaceFolder should return the picked folder
      expect(getActiveWorkspaceFolder()).toBe(folder2);
    });

    it("returns undefined when user cancels the quick pick", async () => {
      const folder1 = { uri: { fsPath: "/repo1" }, name: "repo1", index: 0 };
      const folder2 = { uri: { fsPath: "/repo2" }, name: "repo2", index: 1 };
      (vscode.workspace as any).workspaceFolders = [folder1, folder2];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(
        undefined,
      );

      const result = await selectRepository();
      expect(result).toBeUndefined();

      // Active folder should still be the default (first)
      expect(getActiveWorkspaceFolder()).toBe(folder1);
    });

    it("remembers the selected folder across calls", async () => {
      const folder1 = { uri: { fsPath: "/repo1" }, name: "repo1", index: 0 };
      const folder2 = { uri: { fsPath: "/repo2" }, name: "repo2", index: 1 };
      const folder3 = { uri: { fsPath: "/repo3" }, name: "repo3", index: 2 };
      (vscode.workspace as any).workspaceFolders = [
        folder1,
        folder2,
        folder3,
      ];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: "repo3",
        description: "/repo3",
        folder: folder3,
      });

      await selectRepository();
      expect(getActiveWorkspaceFolder()).toBe(folder3);

      // Calling again should still show repo3 as active
      expect(getActiveWorkspaceFolder()).toBe(folder3);
    });

    it("falls back to first folder if previously selected folder was removed", () => {
      const folder1 = { uri: { fsPath: "/repo1" }, name: "repo1", index: 0 };
      const folder2 = { uri: { fsPath: "/repo2" }, name: "repo2", index: 1 };
      const folder3 = { uri: { fsPath: "/repo3" }, name: "repo3", index: 2 };
      (vscode.workspace as any).workspaceFolders = [
        folder1,
        folder2,
        folder3,
      ];

      // Simulate a selection of folder3 by directly manipulating state
      // We do this by calling selectRepository
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: "repo3",
        description: "/repo3",
        folder: folder3,
      });

      return selectRepository().then(() => {
        // Now remove folder3 from workspace
        (vscode.workspace as any).workspaceFolders = [folder1, folder2];

        // Should fall back to first folder since folder3 is no longer in the workspace
        expect(getActiveWorkspaceFolder()).toBe(folder1);
      });
    });
  });
});

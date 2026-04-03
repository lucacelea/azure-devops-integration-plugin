import * as vscode from "vscode";
import { pickRepository } from "../repoPicker";

jest.mock("../git", () => ({
  getRemoteUrl: jest.fn(),
  getCurrentBranch: jest.fn(),
}));

const git = jest.requireMock("../git") as {
  getRemoteUrl: jest.Mock;
  getCurrentBranch: jest.Mock;
};

function makeFolder(name: string, fsPath?: string): vscode.WorkspaceFolder {
  return {
    uri: { fsPath: fsPath ?? `/${name}` } as any,
    name,
    index: 0,
  };
}

describe("pickRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = undefined;
  });

  it("shows error and returns undefined when no workspace folders are open", async () => {
    const result = await pickRepository();

    expect(result).toBeUndefined();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No workspace folder open.",
    );
  });

  it("returns the single folder directly without showing a picker", async () => {
    const folder = makeFolder("my-repo");
    (vscode.workspace as any).workspaceFolders = [folder];
    git.getRemoteUrl.mockResolvedValue(
      "https://dev.azure.com/org/proj/_git/my-repo",
    );
    git.getCurrentBranch.mockResolvedValue("feature/cool-stuff");

    const result = await pickRepository();

    expect(result).toEqual({ folder, branch: "feature/cool-stuff" });
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("skips the picker when only one folder has an Azure DevOps remote", async () => {
    const adoFolder = makeFolder("ado-repo");
    const otherFolder = makeFolder("github-repo");
    (vscode.workspace as any).workspaceFolders = [adoFolder, otherFolder];

    git.getRemoteUrl.mockImplementation((cwd: string) => {
      if (cwd === "/ado-repo") {
        return Promise.resolve(
          "https://dev.azure.com/org/proj/_git/ado-repo",
        );
      }
      return Promise.resolve("https://github.com/user/github-repo.git");
    });
    git.getCurrentBranch.mockImplementation((cwd: string) => {
      if (cwd === "/ado-repo") {
        return Promise.resolve("main");
      }
      return Promise.resolve("develop");
    });

    const result = await pickRepository();

    expect(result).toEqual({ folder: adoFolder, branch: "main" });
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("shows error when no folder has an Azure DevOps remote", async () => {
    (vscode.workspace as any).workspaceFolders = [
      makeFolder("repo-a"),
      makeFolder("repo-b"),
    ];
    git.getRemoteUrl.mockResolvedValue(
      "https://github.com/user/repo.git",
    );
    git.getCurrentBranch.mockResolvedValue("main");

    const result = await pickRepository();

    expect(result).toBeUndefined();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No workspace folder has an Azure DevOps remote.",
    );
  });

  it("shows a picker when multiple folders have Azure DevOps remotes", async () => {
    const folderA = makeFolder("repo-a");
    const folderB = makeFolder("repo-b");
    (vscode.workspace as any).workspaceFolders = [folderA, folderB];

    git.getRemoteUrl.mockImplementation((cwd: string) => {
      if (cwd === "/repo-a") {
        return Promise.resolve(
          "https://dev.azure.com/org/proj/_git/repo-a",
        );
      }
      return Promise.resolve(
        "https://dev.azure.com/org/proj/_git/repo-b",
      );
    });
    git.getCurrentBranch.mockImplementation((cwd: string) => {
      if (cwd === "/repo-a") {
        return Promise.resolve("feature/branch-a");
      }
      return Promise.resolve("feature/branch-b");
    });

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: "repo-b",
      description: "feature/branch-b",
      folder: folderB,
      branch: "feature/branch-b",
    });

    const result = await pickRepository();

    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
    const items = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe("repo-a");
    expect(items[0].description).toBe("feature/branch-a");
    expect(items[1].label).toBe("repo-b");
    expect(items[1].description).toBe("feature/branch-b");
    expect(result).toEqual({ folder: folderB, branch: "feature/branch-b" });
  });

  it("returns undefined when the user cancels the picker", async () => {
    const folderA = makeFolder("repo-a");
    const folderB = makeFolder("repo-b");
    (vscode.workspace as any).workspaceFolders = [folderA, folderB];

    git.getRemoteUrl.mockResolvedValue(
      "https://dev.azure.com/org/proj/_git/repo",
    );
    git.getCurrentBranch.mockResolvedValue("main");

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    const result = await pickRepository();

    expect(result).toBeUndefined();
  });
});

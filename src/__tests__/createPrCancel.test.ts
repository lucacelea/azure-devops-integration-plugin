import * as vscode from "vscode";
import { createPullRequest } from "../commands/createPr";

jest.mock("../config", () => ({
  getDevOpsConfig: jest.fn().mockResolvedValue({
    organization: "org",
    project: "proj",
    repository: "repo",
  }),
  getBaseUrl: jest.fn().mockReturnValue("https://dev.azure.com/org/proj"),
  getWorkItemProject: jest.fn().mockResolvedValue("proj"),
}));

jest.mock("../auth", () => ({
  getToken: jest.fn().mockResolvedValue("token"),
}));

jest.mock("../git", () => ({
  getCurrentBranch: jest.fn().mockResolvedValue("feature/my-branch"),
  getDefaultBranch: jest.fn().mockResolvedValue("main"),
  getRepositoryRoot: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../workItem", () => ({
  getWorkItemId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../tempMarkdownEditor", () => ({
  editMarkdownViaTempFile: jest.fn().mockResolvedValue("PR description"),
}));

jest.mock("../api", () => ({
  createPullRequestApi: jest.fn(),
  getAssignedWorkItems: jest.fn().mockResolvedValue([]),
  getRepositoryId: jest.fn().mockResolvedValue("repo-id"),
  getUserId: jest.fn().mockResolvedValue("user-id"),
  setAutoComplete: jest.fn(),
  updateWorkItemState: jest.fn(),
}));

const api = jest.requireMock("../api") as {
  createPullRequestApi: jest.Mock;
};

describe("createPullRequest cancel confirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore withProgress to its default implementation after clearAllMocks resets it
    (vscode.window.withProgress as jest.Mock).mockImplementation(
      async (_options: unknown, task: () => unknown) => await task(),
    );

    // Restore workspace.getConfiguration after clearAllMocks resets it
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
    });

    // Default happy-path answers for the pickers shown before the editor
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce("My PR title")   // title
      .mockResolvedValueOnce("main");          // target branch

    (vscode.window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce({ label: "No", value: false }); // draft picker
  });

  it("does not call createPullRequestApi when the user cancels the confirmation", async () => {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("Cancel");

    await createPullRequest({} as vscode.SecretStorage);

    expect(api.createPullRequestApi).not.toHaveBeenCalled();
  });

  it("does not call createPullRequestApi when the user dismisses the confirmation", async () => {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

    await createPullRequest({} as vscode.SecretStorage);

    expect(api.createPullRequestApi).not.toHaveBeenCalled();
  });

  it("calls createPullRequestApi when the user confirms", async () => {
    (vscode.window.showInformationMessage as jest.Mock)
      .mockResolvedValueOnce("Create PR")   // confirmation dialog
      .mockResolvedValue(undefined);         // post-create dialog

    api.createPullRequestApi.mockResolvedValue({ pullRequestId: 99 });

    await createPullRequest({} as vscode.SecretStorage);

    expect(api.createPullRequestApi).toHaveBeenCalledTimes(1);
  });
});

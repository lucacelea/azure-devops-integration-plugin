import * as vscode from "vscode";
import { editExistingPrDescription } from "../commands/editPrDescription";
import { EnrichedPullRequest } from "../api";

jest.mock("../auth", () => ({
  getToken: jest.fn().mockResolvedValue("token"),
}));

jest.mock("../api", () => ({
  getPullRequestDetails: jest.fn(),
  updatePullRequestDescription: jest.fn(),
}));

jest.mock("../tempMarkdownEditor", () => ({
  editMarkdownViaTempFile: jest.fn(),
}));

const api = jest.requireMock("../api") as {
  getPullRequestDetails: jest.Mock;
  updatePullRequestDescription: jest.Mock;
};

const tempEditor = jest.requireMock("../tempMarkdownEditor") as {
  editMarkdownViaTempFile: jest.Mock;
};

function makePr(overrides: Partial<EnrichedPullRequest> = {}): EnrichedPullRequest {
  return {
    pullRequestId: 42,
    title: "Example PR",
    description: "Current description",
    sourceRefName: "refs/heads/feature/branch",
    createdBy: { displayName: "User", id: "user1" },
    reviewers: [],
    repository: {
      id: "repo1",
      name: "repo",
      project: { id: "proj1", name: "proj" },
    },
    status: "active",
    isDraft: false,
    url: "",
    unresolvedCommentCount: 0,
    commentThreads: [],
    checksStatus: "none",
    checks: [],
    workItems: [],
    ...overrides,
  };
}

describe("editExistingPrDescription", () => {
  beforeEach(() => {
    api.getPullRequestDetails.mockReset();
    api.updatePullRequestDescription.mockReset();
    tempEditor.editMarkdownViaTempFile.mockReset();
    (vscode.window.showQuickPick as jest.Mock).mockReset();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("Open Editor");
    (vscode.window.withProgress as jest.Mock).mockClear();
  });

  it("updates the selected PR from the command palette flow", async () => {
    const pr = makePr();
    const provider = {
      secretStorage: {},
      getCreatedByMePullRequests: jest
        .fn()
        .mockResolvedValue({ org: "org", pullRequests: [pr] }),
      refresh: jest.fn(),
    } as any;

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: pr.title,
      description: "#42 · repo",
      detail: "Branch: feature/branch",
      pr,
    });
    api.getPullRequestDetails.mockResolvedValue({ description: "Current description" });
    tempEditor.editMarkdownViaTempFile.mockResolvedValue("Updated description");

    await editExistingPrDescription(provider);

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: "Example PR",
          description: "#42 · repo",
          detail: "Branch: feature/branch",
          pr,
        }),
      ],
      { placeHolder: "Select a pull request to edit its description" },
    );
    expect(api.updatePullRequestDescription).toHaveBeenCalledWith(
      "org",
      "proj",
      "repo1",
      42,
      "Updated description",
      "token",
    );
    expect(provider.refresh).toHaveBeenCalled();
  });

  it("uses the clicked PR item directly for the context menu flow", async () => {
    const pr = makePr({ pullRequestId: 7, title: "Sidebar PR" });
    const provider = {
      secretStorage: {},
      getCreatedByMePullRequests: jest.fn(),
      refresh: jest.fn(),
    } as any;

    api.getPullRequestDetails.mockResolvedValue({ description: "" });
    tempEditor.editMarkdownViaTempFile.mockResolvedValue("New body");

    await editExistingPrDescription(provider, { pr, org: "sidebar-org" } as any);

    expect(provider.getCreatedByMePullRequests).not.toHaveBeenCalled();
    expect(api.getPullRequestDetails).toHaveBeenCalledWith(
      "sidebar-org",
      "proj",
      "repo1",
      7,
      "token",
    );
    expect(tempEditor.editMarkdownViaTempFile).toHaveBeenCalledWith("", 
      expect.objectContaining({
        infoMessage: "Edit the PR description, then close the tab to submit.",
        openWhenEmpty: true,
        filePrefix: "pr-7-description",
        showCancellableNotification: "Editing PR description — close the tab to submit, or click Cancel to abort.",
        cancelActionLabel: "Cancel",
      }),
    );
    expect(api.updatePullRequestDescription).toHaveBeenCalledWith(
      "sidebar-org",
      "proj",
      "repo1",
      7,
      "New body",
      "token",
    );
  });

  it("clears the description when the edited content is empty", async () => {
    const pr = makePr();
    const provider = {
      secretStorage: {},
      getCreatedByMePullRequests: jest
        .fn()
        .mockResolvedValue({ org: "org", pullRequests: [pr] }),
      refresh: jest.fn(),
    } as any;

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: pr.title,
      description: "#42 · repo",
      detail: "Branch: feature/branch",
      pr,
    });
    api.getPullRequestDetails.mockResolvedValue({ description: "Current description" });
    tempEditor.editMarkdownViaTempFile.mockResolvedValue("");

    await editExistingPrDescription(provider);

    expect(api.updatePullRequestDescription).toHaveBeenCalledWith(
      "org",
      "proj",
      "repo1",
      42,
      "",
      "token",
    );
  });

  it("skips the update when the description is unchanged after trimming", async () => {
    const pr = makePr();
    const provider = {
      secretStorage: {},
      getCreatedByMePullRequests: jest
        .fn()
        .mockResolvedValue({ org: "org", pullRequests: [pr] }),
      refresh: jest.fn(),
    } as any;

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: pr.title,
      description: "#42 · repo",
      detail: "Branch: feature/branch",
      pr,
    });
    api.getPullRequestDetails.mockResolvedValue({ description: "Current description\n" });
    tempEditor.editMarkdownViaTempFile.mockResolvedValue("Current description");

    await editExistingPrDescription(provider);

    expect(api.updatePullRequestDescription).not.toHaveBeenCalled();
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it("skips the update when the temp editor is canceled", async () => {
    const pr = makePr();
    const provider = {
      secretStorage: {},
      getCreatedByMePullRequests: jest
        .fn()
        .mockResolvedValue({ org: "org", pullRequests: [pr] }),
      refresh: jest.fn(),
    } as any;

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      label: pr.title,
      description: "#42 · repo",
      detail: "Branch: feature/branch",
      pr,
    });
    api.getPullRequestDetails.mockResolvedValue({ description: "Current description" });
    tempEditor.editMarkdownViaTempFile.mockResolvedValue(undefined);

    await editExistingPrDescription(provider);

    expect(api.updatePullRequestDescription).not.toHaveBeenCalled();
    expect(provider.refresh).not.toHaveBeenCalled();
  });
});

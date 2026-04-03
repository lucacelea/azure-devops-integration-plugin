import * as vscode from "vscode";
import { EnrichedPullRequest } from "../api";

jest.mock("../auth", () => ({
  getToken: jest.fn().mockResolvedValue("token"),
  getAuthenticationRequiredMessage: jest
    .fn()
    .mockReturnValue(
      "Not authenticated. Sign in with Azure AD or set a Personal Access Token.",
    ),
}));

jest.mock("../api", () => ({
  updateReviewerVote: jest.fn(),
  completePullRequest: jest.fn(),
  abandonPullRequest: jest.fn(),
  addPullRequestComment: jest.fn(),
  getPullRequestDetails: jest.fn(),
  updatePullRequestTitle: jest.fn(),
}));

jest.mock("../prLinks", () => ({
  buildPullRequestUrl: jest.fn().mockReturnValue("https://example.com"),
}));

const api = jest.requireMock("../api") as {
  updatePullRequestTitle: jest.Mock;
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

function makeItem(pr: EnrichedPullRequest, org = "org") {
  return { pr, org } as any;
}

function makeProvider() {
  return {
    secretStorage: {},
    cachedUserId: "user1",
    refresh: jest.fn(),
  } as any;
}

describe("editPrTitle command", () => {
  let registerPrActions: typeof import("../commands/prActions").registerPrActions;

  beforeAll(() => {
    ({ registerPrActions } = require("../commands/prActions"));
  });

  beforeEach(() => {
    api.updatePullRequestTitle.mockReset();
    (vscode.window.showInputBox as jest.Mock).mockReset();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showInformationMessage as jest.Mock).mockReset();
  });

  function getEditTitleHandler(provider: any) {
    (vscode.commands.registerCommand as jest.Mock).mockClear();
    const context = { subscriptions: { push: jest.fn() } } as any;
    registerPrActions(context, provider);
    const registerCalls = (vscode.commands.registerCommand as jest.Mock).mock
      .calls;
    return registerCalls.find(
      ([cmd]: [string]) => cmd === "azureDevops.editPrTitle",
    )![1];
  }

  it("updates the PR title when the user enters a new title", async () => {
    const pr = makePr();
    const provider = makeProvider();
    const handler = getEditTitleHandler(provider);

    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("New Title");

    await handler(makeItem(pr));

    expect(vscode.window.showInputBox).toHaveBeenCalledWith({
      prompt: "Edit title of PR #42",
      value: "Example PR",
    });
    expect(api.updatePullRequestTitle).toHaveBeenCalledWith(
      "org",
      "proj",
      "repo1",
      42,
      "New Title",
      "token",
    );
    expect(provider.refresh).toHaveBeenCalled();
  });

  it("skips update when the input box is cancelled", async () => {
    const pr = makePr();
    const provider = makeProvider();
    const handler = getEditTitleHandler(provider);

    (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

    await handler(makeItem(pr));

    expect(api.updatePullRequestTitle).not.toHaveBeenCalled();
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it("skips update when the title is unchanged", async () => {
    const pr = makePr({ title: "Same Title" });
    const provider = makeProvider();
    const handler = getEditTitleHandler(provider);

    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("Same Title");

    await handler(makeItem(pr));

    expect(api.updatePullRequestTitle).not.toHaveBeenCalled();
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it("shows error message when the API call fails", async () => {
    const pr = makePr();
    const provider = makeProvider();
    const handler = getEditTitleHandler(provider);

    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("New Title");
    api.updatePullRequestTitle.mockRejectedValue(new Error("HTTP 403"));

    await handler(makeItem(pr));

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Failed to update title: HTTP 403",
    );
  });
});

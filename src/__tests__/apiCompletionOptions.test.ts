import { EventEmitter } from "events";

jest.mock("https", () => ({
  request: jest.fn(),
}));

jest.mock("../auth", () => ({
  getConfiguredAuthMethod: jest.fn().mockReturnValue("pat"),
  getResolvedAuthMethodForToken: jest.fn().mockReturnValue(undefined),
}));

describe("pull request completion options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds the default merge commit message", () => {
    const { buildMergeCommitMessage } = require("../api");

    expect(buildMergeCommitMessage(99, "My PR title")).toBe(
      "Merged PR 99: My PR title",
    );
  });

  it("sends the merge commit message when updating completion options", async () => {
    const https = require("https") as {
      request: jest.Mock;
    };

    let capturedBody = "";

    https.request.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
        const response = new EventEmitter() as EventEmitter & { statusCode?: number };
        response.statusCode = 200;
        const req = {
          write: jest.fn((chunk: string) => {
            capturedBody += chunk;
          }),
          end: jest.fn(() => {
            response.emit("data", "{}");
            response.emit("end");
          }),
          on: jest.fn(),
        };

        callback(response);
        return req;
      },
    );

    const { updatePullRequestCompletionOptions } = require("../api");

    await updatePullRequestCompletionOptions(
      "org",
      "proj",
      "repo-id",
      99,
      {
        mergeStrategy: "squash",
        deleteSourceBranch: true,
        completeWorkItems: true,
        mergeCommitMessage: "Merged PR 99: My PR title",
      },
      "token",
    );

    expect(https.request).toHaveBeenCalledTimes(1);
    expect(https.request.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        method: "PATCH",
        hostname: "dev.azure.com",
      }),
    );
    expect(JSON.parse(capturedBody)).toEqual({
      completionOptions: {
        mergeStrategy: "squash",
        deleteSourceBranch: true,
        transitionWorkItems: true,
        mergeCommitMessage: "Merged PR 99: My PR title",
      },
    });
  });
});

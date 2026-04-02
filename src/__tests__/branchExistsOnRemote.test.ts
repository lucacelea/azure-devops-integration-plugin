import { branchExistsOnRemote } from "../git";

jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("../repoSelector", () => ({
  getActiveWorkspaceFolder: jest.fn().mockReturnValue({ uri: { fsPath: "/fake/workspace" }, name: "workspace", index: 0 }),
}));

const { exec } = require("child_process") as { exec: jest.Mock };

function mockExec(stdout: string, error: Error | null = null) {
  exec.mockImplementation(
    (
      _cmd: string,
      _opts: object,
      cb: (err: Error | null, stdout: string) => void,
    ) => {
      cb(error, stdout);
    },
  );
}

describe("branchExistsOnRemote", () => {
  beforeEach(() => {
    exec.mockReset();
  });

  it("returns true when ls-remote returns non-empty output", async () => {
    mockExec(
      "abc123\trefs/heads/my-feature\n",
    );
    const result = await branchExistsOnRemote("my-feature");
    expect(result).toBe(true);
  });

  it("returns false when ls-remote returns empty output", async () => {
    mockExec("");
    const result = await branchExistsOnRemote("my-feature");
    expect(result).toBe(false);
  });

  it("returns false when ls-remote fails (non-zero exit)", async () => {
    mockExec("", new Error("git error"));
    const result = await branchExistsOnRemote("my-feature");
    expect(result).toBe(false);
  });
});

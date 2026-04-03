import { buildDefaultPullRequestTitle } from "../commands/createPr";

describe("buildDefaultPullRequestTitle", () => {
  it("strips configured personal and branch-type prefixes before formatting", () => {
    expect(
      buildDefaultPullRequestTitle("lucac/feature/1234-fix-login", {
        branchPrefix: "lucac/",
        workItemId: 1234,
      }),
    ).toBe("#1234 Fix login");
  });

  it("strips only the configured prefix when no work item is present", () => {
    expect(
      buildDefaultPullRequestTitle("lucac/feature/fix-login", {
        branchPrefix: "lucac/",
      }),
    ).toBe("Fix login");
  });

  it("leaves branches unchanged when the configured prefix does not match", () => {
    expect(
      buildDefaultPullRequestTitle("team/feature/1234-fix-login", {
        branchPrefix: "lucac/",
        workItemId: 1234,
      }),
    ).toBe("Team/feature/1234 fix login");
  });

  it("keeps current normalization when branchPrefix is empty", () => {
    expect(
      buildDefaultPullRequestTitle("feature/1234-fix-login", {
        workItemId: 1234,
      }),
    ).toBe("#1234 Fix login");
  });

  it("preserves embedded work item references in the branch name", () => {
    expect(
      buildDefaultPullRequestTitle("lucac/feature/#1234-fix-login", {
        branchPrefix: "lucac/",
      }),
    ).toBe("#1234 Fix login");
  });

  it("normalizes underscore and dash separators", () => {
    expect(
      buildDefaultPullRequestTitle("lucac/chore/1234_fix-login_name", {
        branchPrefix: "lucac/",
        workItemId: 1234,
      }),
    ).toBe("#1234 Fix login name");
  });

  it("preserves existing capitalization after the first character", () => {
    expect(
      buildDefaultPullRequestTitle("lucac/feature/iOS-login-fix", {
        branchPrefix: "lucac/",
      }),
    ).toBe("IOS login fix");
  });
});

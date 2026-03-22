export function buildPullRequestUrl(
    org: string,
    project: string,
    repoName: string,
    prId: number
): string {
    return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repoName)}/pullrequest/${prId}`;
}

export function buildPullRequestThreadUrl(
    org: string,
    project: string,
    repoName: string,
    prId: number,
    threadId?: number
): string {
    const prUrl = buildPullRequestUrl(org, project, repoName, prId);
    if (!threadId || threadId < 1) {
        return prUrl;
    }

    return `${prUrl}?_a=overview&discussionId=${encodeURIComponent(String(threadId))}`;
}

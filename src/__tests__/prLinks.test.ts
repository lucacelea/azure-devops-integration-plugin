import { buildPullRequestThreadUrl, buildPullRequestUrl } from '../prLinks';

describe('prLinks', () => {
    it('builds a PR URL', () => {
        expect(buildPullRequestUrl('org', 'proj name', 'repo', 42)).toBe(
            'https://dev.azure.com/org/proj%20name/_git/repo/pullrequest/42'
        );
    });

    it('builds a thread URL when thread id is available', () => {
        expect(buildPullRequestThreadUrl('org', 'proj', 'repo', 42, 9)).toBe(
            'https://dev.azure.com/org/proj/_git/repo/pullrequest/42?_a=overview&discussionId=9'
        );
    });

    it('falls back to the PR URL when thread id is missing', () => {
        expect(buildPullRequestThreadUrl('org', 'proj', 'repo', 42)).toBe(
            'https://dev.azure.com/org/proj/_git/repo/pullrequest/42'
        );
    });
});

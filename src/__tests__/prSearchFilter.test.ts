import { PullRequestTreeProvider } from '../prSidebar';
import { EnrichedPullRequest } from '../api';

jest.mock('../auth', () => ({
    getToken: jest.fn().mockResolvedValue('fake-token'),
}));
jest.mock('../config', () => ({
    getOrganization: jest.fn().mockResolvedValue('myorg'),
}));
jest.mock('../api', () => ({
    getUserId: jest.fn().mockResolvedValue('user1'),
    getMyPullRequests: jest.fn(),
}));

import { getMyPullRequests } from '../api';

function makePr(overrides: Partial<EnrichedPullRequest> & { pullRequestId: number; title: string }): EnrichedPullRequest {
    return {
        sourceRefName: 'refs/heads/main',
        createdBy: { displayName: 'User', id: 'user1' },
        reviewers: [],
        repository: { id: 'repo1', name: 'repo', project: { id: 'proj1', name: 'proj' } },
        status: 'active',
        isDraft: false,
        url: '',
        unresolvedCommentCount: 0,
        commentThreads: [],
        checksStatus: 'none',
        checks: [],
        ...overrides,
    };
}

describe('PullRequestTreeProvider text search', () => {
    let provider: PullRequestTreeProvider;

    const prA = makePr({ pullRequestId: 101, title: 'Add auth feature', createdBy: { displayName: 'Alice', id: 'a' }, sourceRefName: 'refs/heads/feature/auth' });
    const prB = makePr({ pullRequestId: 202, title: 'Fix database migration', createdBy: { displayName: 'Bob', id: 'b' }, sourceRefName: 'refs/heads/bugfix/db-migration' });
    const prC = makePr({ pullRequestId: 303, title: 'Update README', createdBy: { displayName: 'Charlie', id: 'c' }, sourceRefName: 'refs/heads/docs/readme' });
    const prDraft = makePr({ pullRequestId: 404, title: 'Draft: WIP auth service', createdBy: { displayName: 'Dave', id: 'd' }, isDraft: true, sourceRefName: 'refs/heads/feature/auth-service' });

    beforeEach(() => {
        (getMyPullRequests as jest.Mock).mockResolvedValue({
            createdByMe: [prA, prB],
            assignedToMe: [prC],
            assignedToMyTeams: [prDraft],
        });

        provider = new PullRequestTreeProvider({} as any);
    });

    it('shows all PRs when no search text is set', async () => {
        const children = await provider.getChildren();
        // 3 categories: "Created by me", "Assigned to me", "Assigned to my teams"
        expect(children.length).toBe(3);
    });

    it('filters PRs by title (case-insensitive)', async () => {
        provider.setSearchText('auth');
        const children = await provider.getChildren();
        // prA matches title "Add auth feature", prDraft matches "Draft: WIP auth service"
        // "Created by me" should have prA, "Assigned to my teams" should have prDraft
        expect(children.length).toBe(2);

        const createdChildren = children[0].children!;
        expect(createdChildren.length).toBe(1);
        expect(createdChildren[0].pr!.pullRequestId).toBe(101);

        const teamChildren = children[1].children!;
        expect(teamChildren.length).toBe(1);
        expect(teamChildren[0].pr!.pullRequestId).toBe(404);
    });

    it('filters PRs by author name', async () => {
        provider.setSearchText('bob');
        const children = await provider.getChildren();
        expect(children.length).toBe(1);
        const items = children[0].children!;
        expect(items.length).toBe(1);
        expect(items[0].pr!.pullRequestId).toBe(202);
    });

    it('filters PRs by source branch', async () => {
        provider.setSearchText('db-migration');
        const children = await provider.getChildren();
        expect(children.length).toBe(1);
        const items = children[0].children!;
        expect(items.length).toBe(1);
        expect(items[0].pr!.pullRequestId).toBe(202);
    });

    it('filters PRs by PR ID', async () => {
        provider.setSearchText('303');
        const children = await provider.getChildren();
        expect(children.length).toBe(1);
        const items = children[0].children!;
        expect(items.length).toBe(1);
        expect(items[0].pr!.pullRequestId).toBe(303);
    });

    it('shows "no pull requests" message when search matches nothing', async () => {
        provider.setSearchText('nonexistent');
        const children = await provider.getChildren();
        expect(children.length).toBe(1);
        expect(children[0].label).toContain('No pull requests');
        expect(children[0].label).toContain('nonexistent');
    });

    it('composes text search with predefined filter', async () => {
        provider.setFilter('draft');
        provider.setSearchText('auth');
        const children = await provider.getChildren();
        // Only prDraft is draft AND matches "auth"
        expect(children.length).toBe(1);
        const items = children[0].children!;
        expect(items.length).toBe(1);
        expect(items[0].pr!.pullRequestId).toBe(404);
    });

    it('clears the search text', async () => {
        provider.setSearchText('auth');
        provider.clearSearchText();
        expect(provider.getSearchText()).toBe('');
        const children = await provider.getChildren();
        expect(children.length).toBe(3);
    });

    it('getFilterLabel includes search text', () => {
        provider.setSearchText('auth');
        expect(provider.getFilterLabel()).toBe('search: "auth"');
    });

    it('getFilterLabel combines predefined filter and search text', () => {
        provider.setFilter('draft');
        provider.setSearchText('auth');
        expect(provider.getFilterLabel()).toBe('Drafts, search: "auth"');
    });

    it('getFilterLabel returns predefined filter only when no search', () => {
        provider.setFilter('draft');
        expect(provider.getFilterLabel()).toBe('Drafts');
    });
});

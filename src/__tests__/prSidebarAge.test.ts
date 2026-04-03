import * as vscode from 'vscode';
import { PullRequestItem, formatRelativeTime } from '../prSidebar';
import { EnrichedPullRequest } from '../api';

function makePr(overrides: Partial<EnrichedPullRequest> = {}): EnrichedPullRequest {
    return {
        pullRequestId: 1,
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature',
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
        workItems: [],
        ...overrides,
    };
}

describe('formatRelativeTime', () => {
    it('returns "just now" for very recent dates', () => {
        const now = new Date().toISOString();
        expect(formatRelativeTime(now)).toBe('just now');
    });

    it('returns minutes for dates less than an hour ago', () => {
        const date = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        expect(formatRelativeTime(date)).toBe('15m ago');
    });

    it('returns hours for dates less than a day ago', () => {
        const date = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
        expect(formatRelativeTime(date)).toBe('5h ago');
    });

    it('returns days for dates less than a month ago', () => {
        const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        expect(formatRelativeTime(date)).toBe('3d ago');
    });

    it('returns months for dates less than a year ago', () => {
        const date = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        expect(formatRelativeTime(date)).toBe('2mo ago');
    });

    it('returns years for old dates', () => {
        const date = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
        expect(formatRelativeTime(date)).toBe('1y ago');
    });

    it('returns "just now" for future dates', () => {
        const date = new Date(Date.now() + 10000).toISOString();
        expect(formatRelativeTime(date)).toBe('just now');
    });
});

describe('PullRequestItem.fromPullRequest with creationDate', () => {
    it('shows age in description when creationDate is provided', () => {
        const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const pr = makePr({ creationDate: date });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.description).toBe('2d ago');
    });

    it('shows empty description when creationDate is not provided', () => {
        const pr = makePr();
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.description).toBe('');
    });

    it('shows branch name as first child node', () => {
        const pr = makePr();
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.children).toBeDefined();
        expect(item.children![0].label).toBe('feature');
        expect(item.children![0].contextValue).toBe('branchInfo');
    });

    it('is always collapsible (branch child node)', () => {
        const pr = makePr();
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });
});

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
    it('includes age in description when creationDate is provided', () => {
        const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const pr = makePr({ creationDate: date });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.description).toContain('feature');
        expect(item.description).toContain('2d ago');
    });

    it('shows only branch name when creationDate is not provided', () => {
        const pr = makePr();
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.description).toBe('feature');
    });

    it('includes Created line in tooltip when creationDate is provided', () => {
        const date = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
        const pr = makePr({ creationDate: date });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');
        const tooltipText = (item.tooltip as vscode.MarkdownString).value;

        expect(tooltipText).toContain('Created: 5h ago');
    });

    it('does not include Created line in tooltip when creationDate is absent', () => {
        const pr = makePr();
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');
        const tooltipText = (item.tooltip as vscode.MarkdownString).value;

        expect(tooltipText).not.toContain('Created:');
    });
});

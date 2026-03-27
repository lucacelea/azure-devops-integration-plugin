import * as vscode from 'vscode';
import { PullRequestTreeProvider } from '../prSidebar';
import { EnrichedPullRequest, PrThreadSummary, MyPullRequests } from '../api';

function makeThread(threadId: number, latestCommentId: number): PrThreadSummary {
    return { threadId, status: 'active', latestCommentId };
}

function makePr(id: number, title: string, commentThreads: PrThreadSummary[]): EnrichedPullRequest {
    return {
        pullRequestId: id,
        title,
        sourceRefName: 'refs/heads/feature',
        createdBy: { displayName: 'User', id: 'user1' },
        reviewers: [],
        repository: { id: 'repo1', name: 'repo', project: { id: 'proj1', name: 'proj' } },
        status: 'active',
        isDraft: false,
        url: '',
        unresolvedCommentCount: commentThreads.length,
        commentThreads,
        checksStatus: 'none',
        checks: [],
    };
}

function makeFetchResult(overrides: Partial<MyPullRequests> = {}): { org: string; result: MyPullRequests } {
    return {
        org: 'org',
        result: {
            createdByMe: [],
            assignedToMe: [],
            assignedToMyTeams: [],
            ...overrides,
        },
    };
}

describe('PullRequestTreeProvider.pollForNewComments — notificationScope', () => {
    let provider: PullRequestTreeProvider;
    let showInfoMock: jest.Mock;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        showInfoMock = vscode.window.showInformationMessage as jest.Mock;
        showInfoMock.mockReset();
        showInfoMock.mockResolvedValue(undefined);

        provider = new PullRequestTreeProvider({} as any);
        provider.cachedOrg = 'org';

        // Spy on the private fetchPullRequests method
        fetchSpy = jest.spyOn(provider as any, 'fetchPullRequests');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    function setupScope(scope: string): void {
        const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;
        getConfigMock.mockReturnValue({
            get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === 'notificationScope') { return scope; }
                return defaultValue;
            }),
        });
    }

    it('scope "all" includes team PRs in notifications', async () => {
        setupScope('all');

        const teamPr = makePr(3, 'Team PR', [makeThread(30, 300)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ assignedToMyTeams: [teamPr] })
        );
        // Baseline
        await provider.pollForNewComments();

        // New comment on team PR
        const teamPrUpdated = makePr(3, 'Team PR', [makeThread(30, 301)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ assignedToMyTeams: [teamPrUpdated] })
        );
        await provider.pollForNewComments();

        expect(showInfoMock).toHaveBeenCalledWith(
            'New comments on PR #3: Team PR',
            'Open Comment',
            'Open in DevOps'
        );
    });

    it('scope "participating" excludes team PRs from notifications', async () => {
        setupScope('participating');

        const myPr = makePr(1, 'My PR', [makeThread(10, 100)]);
        const teamPr = makePr(3, 'Team PR', [makeThread(30, 300)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ createdByMe: [myPr], assignedToMyTeams: [teamPr] })
        );
        // Baseline
        await provider.pollForNewComments();

        // New comment on team PR only
        const teamPrUpdated = makePr(3, 'Team PR', [makeThread(30, 301)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ createdByMe: [myPr], assignedToMyTeams: [teamPrUpdated] })
        );
        await provider.pollForNewComments();

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('scope "participating" still notifies for PRs created by me', async () => {
        setupScope('participating');

        const myPr = makePr(1, 'My PR', [makeThread(10, 100)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ createdByMe: [myPr] })
        );
        // Baseline
        await provider.pollForNewComments();

        const myPrUpdated = makePr(1, 'My PR', [makeThread(10, 101)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ createdByMe: [myPrUpdated] })
        );
        await provider.pollForNewComments();

        expect(showInfoMock).toHaveBeenCalledWith(
            'New comments on PR #1: My PR',
            'Open Comment',
            'Open in DevOps'
        );
    });

    it('scope "participating" still notifies for PRs assigned to me', async () => {
        setupScope('participating');

        const assignedPr = makePr(2, 'Assigned PR', [makeThread(20, 200)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ assignedToMe: [assignedPr] })
        );
        // Baseline
        await provider.pollForNewComments();

        const assignedPrUpdated = makePr(2, 'Assigned PR', [makeThread(20, 201)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ assignedToMe: [assignedPrUpdated] })
        );
        await provider.pollForNewComments();

        expect(showInfoMock).toHaveBeenCalledWith(
            'New comments on PR #2: Assigned PR',
            'Open Comment',
            'Open in DevOps'
        );
    });

    it('scope "off" suppresses all notifications', async () => {
        setupScope('off');

        const myPr = makePr(1, 'My PR', [makeThread(10, 100)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ createdByMe: [myPr] })
        );
        // Baseline
        await provider.pollForNewComments();

        const myPrUpdated = makePr(1, 'My PR', [makeThread(10, 101)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ createdByMe: [myPrUpdated] })
        );
        await provider.pollForNewComments();

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('scope "off" suppresses notifications even for directly assigned PRs', async () => {
        setupScope('off');

        const assignedPr = makePr(2, 'Assigned PR', [makeThread(20, 200)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ assignedToMe: [assignedPr] })
        );
        await provider.pollForNewComments();

        const assignedPrUpdated = makePr(2, 'Assigned PR', [makeThread(20, 201)]);
        fetchSpy.mockResolvedValueOnce(
            makeFetchResult({ assignedToMe: [assignedPrUpdated] })
        );
        await provider.pollForNewComments();

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('returns early without notifying when fetchPullRequests returns undefined', async () => {
        setupScope('all');
        fetchSpy.mockResolvedValue(undefined);

        await provider.pollForNewComments();

        expect(showInfoMock).not.toHaveBeenCalled();
    });
});

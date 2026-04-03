import * as vscode from 'vscode';
import { PrChangesProvider, PrCommentThreadItem } from '../prChangesProvider';
import { EnrichedPullRequest, PrThread } from '../api';

jest.mock('../auth', () => ({
    getToken: jest.fn().mockResolvedValue('token'),
}));

jest.mock('../api', () => ({
    getPrThreads: jest.fn(),
    getPrIterations: jest.fn(),
    addPullRequestComment: jest.fn(),
    replyToThread: jest.fn(),
    updateThreadStatus: jest.fn(),
}));

const api = jest.requireMock('../api') as {
    getPrThreads: jest.Mock;
    getPrIterations: jest.Mock;
    updateThreadStatus: jest.Mock;
};

const auth = jest.requireMock('../auth') as {
    getToken: jest.Mock;
};

function makePr(): EnrichedPullRequest {
    return {
        pullRequestId: 42,
        title: 'Example PR',
        sourceRefName: 'refs/heads/main',
        createdBy: { displayName: 'User', id: 'user1' },
        reviewers: [],
        repository: { id: 'repo1', name: 'repo', project: { id: 'proj1', name: 'proj' } },
        status: 'active',
        isDraft: false,
        url: '',
        unresolvedCommentCount: 1,
        commentThreads: [],
        checksStatus: 'none',
        checks: [],
        workItems: [],
    };
}

function makeThread(overrides: Partial<PrThread> = {}): PrThread {
    return {
        id: 7,
        status: 'active',
        isDeleted: false,
        threadContext: {
            filePath: '/src/app.ts',
            rightFileStart: { line: 10, offset: 1 },
            rightFileEnd: { line: 10, offset: 1 },
        },
        comments: [{
            id: 1,
            parentCommentId: 0,
            content: 'Fix this',
            author: { displayName: 'Alice', id: 'a1' },
            publishedDate: '2024-01-15T10:00:00Z',
            commentType: 'text',
            isDeleted: false,
        }],
        ...overrides,
    };
}

describe('PrChangesProvider.changeThreadStatus', () => {
    beforeEach(() => {
        api.updateThreadStatus.mockReset();
        api.updateThreadStatus.mockResolvedValue(undefined);
        auth.getToken.mockReset();
        auth.getToken.mockResolvedValue('token');
        (vscode.window.showErrorMessage as jest.Mock).mockReset();
    });

    it('calls updateThreadStatus with fixed status for resolve', async () => {
        const provider = new PrChangesProvider({} as any);
        provider.selectPr(makePr(), 'org');

        const thread = makeThread();
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        await provider.changeThreadStatus(item, 'fixed');

        expect(api.updateThreadStatus).toHaveBeenCalledWith(
            'org', 'proj', 'repo1', 42, 7, 'fixed', 'token'
        );
    });

    it('calls updateThreadStatus with active status for reactivate', async () => {
        const provider = new PrChangesProvider({} as any);
        provider.selectPr(makePr(), 'org');

        const thread = makeThread({ status: 'fixed' });
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        await provider.changeThreadStatus(item, 'active');

        expect(api.updateThreadStatus).toHaveBeenCalledWith(
            'org', 'proj', 'repo1', 42, 7, 'active', 'token'
        );
    });

    it('calls updateThreadStatus with wontFix status', async () => {
        const provider = new PrChangesProvider({} as any);
        provider.selectPr(makePr(), 'org');

        const thread = makeThread();
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        await provider.changeThreadStatus(item, 'wontFix');

        expect(api.updateThreadStatus).toHaveBeenCalledWith(
            'org', 'proj', 'repo1', 42, 7, 'wontFix', 'token'
        );
    });

    it('calls updateThreadStatus with byDesign status', async () => {
        const provider = new PrChangesProvider({} as any);
        provider.selectPr(makePr(), 'org');

        const thread = makeThread();
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        await provider.changeThreadStatus(item, 'byDesign');

        expect(api.updateThreadStatus).toHaveBeenCalledWith(
            'org', 'proj', 'repo1', 42, 7, 'byDesign', 'token'
        );
    });

    it('does nothing when no PR is selected', async () => {
        const provider = new PrChangesProvider({} as any);
        // Do not call selectPr

        const thread = makeThread();
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        await provider.changeThreadStatus(item, 'fixed');

        expect(api.updateThreadStatus).not.toHaveBeenCalled();
    });

    it('does nothing when no token is available', async () => {
        auth.getToken.mockResolvedValue(null);

        const provider = new PrChangesProvider({} as any);
        provider.selectPr(makePr(), 'org');

        const thread = makeThread();
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        await provider.changeThreadStatus(item, 'fixed');

        expect(api.updateThreadStatus).not.toHaveBeenCalled();
    });

    it('shows error message on API failure', async () => {
        api.updateThreadStatus.mockRejectedValue(new Error('HTTP 403: Forbidden'));

        const provider = new PrChangesProvider({} as any);
        provider.selectPr(makePr(), 'org');

        const thread = makeThread();
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        await provider.changeThreadStatus(item, 'fixed');

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to update thread status: HTTP 403: Forbidden'
        );
    });
});

import * as vscode from 'vscode';
import { PrChangesProvider } from '../prChangesProvider';
import { EnrichedPullRequest } from '../api';

jest.mock('../auth', () => ({
    getToken: jest.fn().mockResolvedValue('token'),
}));

jest.mock('../api', () => ({
    getPrThreads: jest.fn(),
    getPrIterations: jest.fn(),
    getPrChanges: jest.fn(),
    addPullRequestComment: jest.fn(),
    replyToThread: jest.fn(),
}));

const api = jest.requireMock('../api') as {
    getPrThreads: jest.Mock;
    getPrIterations: jest.Mock;
    getPrChanges: jest.Mock;
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

describe('PrChangesProvider.openThreadById', () => {
    beforeEach(() => {
        api.getPrIterations.mockReset();
        api.getPrThreads.mockReset();
        api.getPrChanges.mockReset();
        (vscode.commands.executeCommand as jest.Mock).mockReset();
        (vscode.workspace.openTextDocument as jest.Mock).mockReset();
        (vscode.window.showTextDocument as jest.Mock).mockReset();
    });

    it('opens a file thread in a diff view', async () => {
        api.getPrIterations.mockResolvedValue([{
            sourceRefCommit: { commitId: 'src123' },
            targetRefCommit: { commitId: 'tgt456' },
        }]);
        api.getPrThreads.mockResolvedValue([{
            id: 9,
            status: 'active',
            isDeleted: false,
            threadContext: {
                filePath: '/src/app.ts',
                rightFileStart: { line: 12, offset: 1 },
                rightFileEnd: { line: 12, offset: 1 },
            },
            comments: [{
                id: 1,
                parentCommentId: 0,
                content: 'Hello',
                author: { displayName: 'Alice', id: 'a1' },
                publishedDate: '2024-01-15T10:00:00Z',
                commentType: 'text',
                isDeleted: false,
            }],
        }]);

        const provider = new PrChangesProvider({} as any);
        const result = await provider.openThreadById(makePr(), 'org', 9);

        expect(result).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.diff',
            expect.anything(),
            expect.anything(),
            '/src/app.ts'
        );
    });

    it('opens a general thread in the markdown document view', async () => {
        api.getPrIterations.mockResolvedValue([{
            sourceRefCommit: { commitId: 'src123' },
            targetRefCommit: { commitId: 'tgt456' },
        }]);
        api.getPrThreads.mockResolvedValue([{
            id: 11,
            status: 'active',
            isDeleted: false,
            comments: [{
                id: 1,
                parentCommentId: 0,
                content: 'General comment',
                author: { displayName: 'Alice', id: 'a1' },
                publishedDate: '2024-01-15T10:00:00Z',
                commentType: 'text',
                isDeleted: false,
            }],
        }]);
        (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({ uri: 'doc' });

        const provider = new PrChangesProvider({} as any);
        const result = await provider.openThreadById(makePr(), 'org', 11);

        expect(result).toBe(true);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
        expect(vscode.window.showTextDocument).toHaveBeenCalledWith({ uri: 'doc' }, { preview: true });
    });

    it('lists general comments before changed files in the root tree', async () => {
        api.getPrIterations.mockResolvedValue([{
            id: 1,
            sourceRefCommit: { commitId: 'src123' },
            targetRefCommit: { commitId: 'tgt456' },
        }]);
        api.getPrChanges.mockResolvedValue([
            {
                changeType: 'edit',
                item: { path: '/src/app.ts' },
            },
        ]);
        api.getPrThreads.mockResolvedValue([
            {
                id: 11,
                status: 'active',
                isDeleted: false,
                comments: [{
                    id: 1,
                    parentCommentId: 0,
                    content: 'General comment',
                    author: { displayName: 'Alice', id: 'a1' },
                    publishedDate: '2024-01-15T10:00:00Z',
                    commentType: 'text',
                    isDeleted: false,
                }],
            },
            {
                id: 12,
                status: 'active',
                isDeleted: false,
                threadContext: {
                    filePath: '/src/app.ts',
                    rightFileStart: { line: 12, offset: 1 },
                    rightFileEnd: { line: 12, offset: 1 },
                },
                comments: [{
                    id: 2,
                    parentCommentId: 0,
                    content: 'File comment',
                    author: { displayName: 'Bob', id: 'b1' },
                    publishedDate: '2024-01-15T10:05:00Z',
                    commentType: 'text',
                    isDeleted: false,
                }],
            },
        ]);

        const provider = new PrChangesProvider({} as any);
        provider.selectPr(makePr(), 'org');
        const items = await provider.getChildren();

        expect(items).toHaveLength(2);
        expect(items[0].label).toBe('General Comments (1)');
        expect(items[1].label).toBe('app.ts');
    });
});

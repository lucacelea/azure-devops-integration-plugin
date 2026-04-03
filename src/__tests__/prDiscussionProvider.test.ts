import { PrCommentThreadItem, PrCommentReplyItem } from '../prChangesProvider';
import { PrThread } from '../api';

function makeThread(overrides: Partial<PrThread> = {}): PrThread {
    return {
        id: 1,
        status: 'active',
        isDeleted: false,
        comments: [
            {
                id: 1,
                parentCommentId: 0,
                content: 'This is a general comment that is quite long and would normally be truncated in the tree view description',
                author: { displayName: 'Alice', id: 'a1' },
                publishedDate: '2024-01-15T10:00:00Z',
                commentType: 'text',
                isDeleted: false,
            },
        ],
        ...overrides,
    };
}

function makeThreadWithReply(): PrThread {
    return makeThread({
        comments: [
            {
                id: 1,
                parentCommentId: 0,
                content: 'This is the original comment',
                author: { displayName: 'Alice', id: 'a1' },
                publishedDate: '2024-01-15T10:00:00Z',
                commentType: 'text',
                isDeleted: false,
            },
            {
                id: 2,
                parentCommentId: 1,
                content: 'This is a reply that should also be openable',
                author: { displayName: 'Bob', id: 'b1' },
                publishedDate: '2024-01-15T11:00:00Z',
                commentType: 'text',
                isDeleted: false,
            },
        ],
    });
}

describe('PrCommentThreadItem', () => {
    it('sets a command for general comments (no file context)', () => {
        const thread = makeThread({ threadContext: undefined });
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src123', 'tgt456');

        expect(item.command).toBeDefined();
        expect(item.command!.command).toBe('azureDevops.openDiscussionComment');
        expect(item.command!.arguments).toEqual([item]);
    });

    it('sets a command for file-level comments', () => {
        const thread = makeThread({
            threadContext: {
                filePath: '/src/app.ts',
                rightFileStart: { line: 10, offset: 1 },
                rightFileEnd: { line: 10, offset: 1 },
            },
        });
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src123', 'tgt456');

        expect(item.command).toBeDefined();
        expect(item.command!.command).toBe('azureDevops.openDiscussionComment');
    });

    it('truncates label for tree view display', () => {
        const longContent = 'A'.repeat(200);
        const thread = makeThread({
            comments: [{
                id: 1, parentCommentId: 0,
                content: longContent,
                author: { displayName: 'Bob', id: 'b1' },
                publishedDate: '2024-01-15T10:00:00Z',
                commentType: 'text',
                isDeleted: false,
            }],
        });
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        // Label includes author + truncated preview (80 chars)
        expect((item.label as string).length).toBeLessThan(200);
    });

    it('uses megaphone icon for general comments', () => {
        const thread = makeThread({ threadContext: undefined });
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        expect((item.iconPath as any)?.id).toBe('megaphone');
    });
});

describe('PrCommentReplyItem', () => {
    it('sets a command that opens the parent thread', () => {
        const thread = makeThreadWithReply();
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        expect(item.replyItems).toHaveLength(1);
        const reply = item.replyItems[0];
        expect(reply.command).toBeDefined();
        expect(reply.command!.command).toBe('azureDevops.openDiscussionComment');
        expect(reply.command!.arguments).toEqual([item]);
    });

    it('truncates long reply content in description', () => {
        const thread = makeThread({
            comments: [
                {
                    id: 1, parentCommentId: 0,
                    content: 'Original',
                    author: { displayName: 'Alice', id: 'a1' },
                    publishedDate: '2024-01-15T10:00:00Z',
                    commentType: 'text',
                    isDeleted: false,
                },
                {
                    id: 2, parentCommentId: 1,
                    content: 'R'.repeat(200),
                    author: { displayName: 'Bob', id: 'b1' },
                    publishedDate: '2024-01-15T11:00:00Z',
                    commentType: 'text',
                    isDeleted: false,
                },
            ],
        });
        const item = new PrCommentThreadItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');
        const reply = item.replyItems[0];

        expect((reply.description as string).length).toBeLessThanOrEqual(100);
    });
});

import { PrDiscussionItem } from '../prDiscussionProvider';
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

describe('PrDiscussionItem', () => {
    it('sets a command for general comments (no file context)', () => {
        const thread = makeThread({ threadContext: undefined });
        const item = new PrDiscussionItem(thread, 'org', 'proj', 'repo1', 42, 'src123', 'tgt456');

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
        const item = new PrDiscussionItem(thread, 'org', 'proj', 'repo1', 42, 'src123', 'tgt456');

        expect(item.command).toBeDefined();
        expect(item.command!.command).toBe('azureDevops.openDiscussionComment');
    });

    it('truncates description for tree view display', () => {
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
        const item = new PrDiscussionItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        // Description should be truncated (80 char preview)
        expect((item.description as string).length).toBeLessThan(200);
    });

    it('uses megaphone icon for general comments', () => {
        const thread = makeThread({ threadContext: undefined });
        const item = new PrDiscussionItem(thread, 'org', 'proj', 'repo1', 42, 'src', 'tgt');

        expect((item.iconPath as any)?.id).toBe('megaphone');
    });
});

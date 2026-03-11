import { PrCommentDocProvider, setCommentContent, buildCommentDocUri, PR_COMMENT_SCHEME } from '../prCommentDocProvider';
import { Uri } from 'vscode';

describe('PrCommentDocProvider', () => {
    let provider: PrCommentDocProvider;

    beforeEach(() => {
        provider = new PrCommentDocProvider();
    });

    it('returns empty string for unknown thread id', () => {
        const uri = Uri.parse(`${PR_COMMENT_SCHEME}://thread/Thread-999.md`);
        expect(provider.provideTextDocumentContent(uri)).toBe('');
    });

    it('returns stored content for a known thread id', () => {
        const markdown = '**Author**\n\nHello, this is my comment.';
        setCommentContent(42, markdown);

        const uri = Uri.parse(`${PR_COMMENT_SCHEME}://thread/Thread-42.md`);
        expect(provider.provideTextDocumentContent(uri)).toBe(markdown);
    });

    it('returns empty string when URI path does not match expected pattern', () => {
        const uri = Uri.parse(`${PR_COMMENT_SCHEME}://thread/bad-path.md`);
        expect(provider.provideTextDocumentContent(uri)).toBe('');
    });

    it('overwrites content for the same thread id', () => {
        setCommentContent(7, 'first');
        setCommentContent(7, 'second');

        const uri = Uri.parse(`${PR_COMMENT_SCHEME}://thread/Thread-7.md`);
        expect(provider.provideTextDocumentContent(uri)).toBe('second');
    });
});

describe('buildCommentDocUri', () => {
    it('produces a URI with the correct scheme and path', () => {
        const uri = buildCommentDocUri(123);
        expect(uri.scheme).toBe(PR_COMMENT_SCHEME);
        expect(uri.path).toContain('Thread-123.md');
    });
});

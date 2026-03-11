import * as vscode from 'vscode';

export const PR_COMMENT_SCHEME = 'azuredevops-pr-comment';

const contentStore = new Map<number, string>();

/** Store markdown content for a discussion thread so the content provider can serve it. */
export function setCommentContent(threadId: number, markdown: string): void {
    contentStore.set(threadId, markdown);
}

/** Build a read-only virtual-document URI for the given thread. */
export function buildCommentDocUri(threadId: number): vscode.Uri {
    return vscode.Uri.parse(`${PR_COMMENT_SCHEME}://thread/Thread-${threadId}.md`);
}

/**
 * Serves full PR comment threads as read-only markdown documents.
 * Content is populated via {@link setCommentContent} before the URI is opened.
 */
export class PrCommentDocProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        const match = uri.path.match(/Thread-(\d+)\.md$/);
        if (!match) { return ''; }
        return contentStore.get(Number(match[1])) ?? '';
    }
}

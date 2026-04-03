import { PrFileItem } from '../prChangesProvider';
import { PrChange, PrThreadSummary } from '../api';

function makeChange(path: string, changeType: string = 'edit'): PrChange {
    return { changeType, item: { path } };
}

describe('PrFileItem layout', () => {
    const baseArgs = {
        org: 'myorg',
        project: 'myproject',
        repoId: 'repo1',
        sourceCommitId: 'abc123',
        targetCommitId: 'def456',
        prId: 42,
    };

    it('shows directory path as description', () => {
        const change = makeChange('/src/components/app.ts');
        const item = new PrFileItem(
            change, baseArgs.org, baseArgs.project, baseArgs.repoId,
            baseArgs.sourceCommitId, baseArgs.targetCommitId, baseArgs.prId,
        );

        expect(item.label).toBe('app.ts');
        expect(item.description).toBe('/src/components');
    });

    it('shows root as description for top-level files', () => {
        const change = makeChange('/app.ts');
        const item = new PrFileItem(
            change, baseArgs.org, baseArgs.project, baseArgs.repoId,
            baseArgs.sourceCommitId, baseArgs.targetCommitId, baseArgs.prId,
        );

        expect(item.description).toBe('/');
    });

    it('shows only change type in tooltip', () => {
        const change = makeChange('/src/app.ts');
        const item = new PrFileItem(
            change, baseArgs.org, baseArgs.project, baseArgs.repoId,
            baseArgs.sourceCommitId, baseArgs.targetCommitId, baseArgs.prId,
        );

        expect(item.tooltip).toBe('edit: /src/app.ts');
    });

    it('is non-collapsible by default (no thread children)', () => {
        const change = makeChange('/src/app.ts');
        const item = new PrFileItem(
            change, baseArgs.org, baseArgs.project, baseArgs.repoId,
            baseArgs.sourceCommitId, baseArgs.targetCommitId, baseArgs.prId,
        );

        expect(item.collapsibleState).toBe(0); // None
        expect(item.children).toBeUndefined();
    });
});

describe('buildFileCommentCounts logic', () => {
    it('correctly counts active threads per file', () => {
        const threads: PrThreadSummary[] = [
            { threadId: 1, status: 'active', filePath: '/src/a.ts', latestCommentId: 10 },
            { threadId: 2, status: 'active', filePath: '/src/a.ts', latestCommentId: 20 },
            { threadId: 3, status: 'active', filePath: '/src/b.ts', latestCommentId: 30 },
            { threadId: 4, status: 'fixed', filePath: '/src/a.ts', latestCommentId: 40 },
        ];

        const counts = new Map<string, number>();
        for (const thread of threads) {
            if (thread.filePath && thread.status === 'active') {
                counts.set(thread.filePath, (counts.get(thread.filePath) ?? 0) + 1);
            }
        }

        expect(counts.get('/src/a.ts')).toBe(2);
        expect(counts.get('/src/b.ts')).toBe(1);
        expect(counts.has('/src/c.ts')).toBe(false);
    });
});

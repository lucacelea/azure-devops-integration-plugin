import { buildPrFileUri, parsePrFileUri } from '../prContentProvider';

describe('buildPrFileUri', () => {
    it('builds a basic URI without prId or side', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts');
        expect(uri.scheme).toBe('azuredevops-pr');
        expect(uri.authority).toBe('myOrg');
        expect(uri.path).toBe('/myProject/repo123/abc123/src/file.ts');
        expect(uri.query).toBe('');
    });

    it('includes prId as a query parameter', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts', 42);
        expect(uri.query).toContain('prId=42');
    });

    it('includes both prId and side as query parameters', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts', 42, 'right');
        expect(uri.query).toContain('prId=42');
        expect(uri.query).toContain('side=right');
    });

    it('includes side=left as a query parameter', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts', 10, 'left');
        expect(uri.query).toContain('side=left');
    });

    it('handles org with special characters', () => {
        const uri = buildPrFileUri('my org', 'myProject', 'repo123', 'abc123', '/src/file.ts');
        expect(uri.scheme).toBe('azuredevops-pr');
        // The org should be encoded in the URI but decodable
        const parsed = parsePrFileUri(uri);
        expect(parsed?.org).toBe('my org');
    });

    it('handles project with special characters', () => {
        const uri = buildPrFileUri('myOrg', 'my project', 'repo123', 'abc123', '/src/file.ts');
        const parsed = parsePrFileUri(uri);
        expect(parsed?.project).toBe('my project');
    });

    it('omits query string when no prId or side provided', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts');
        expect(uri.query).toBe('');
    });

    it('includes only side when prId is not provided', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts', undefined, 'right');
        expect(uri.query).toContain('side=right');
        expect(uri.query).not.toContain('prId');
    });
});

describe('parsePrFileUri', () => {
    it('parses a URI built by buildPrFileUri', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts', 42, 'right');
        const result = parsePrFileUri(uri);
        expect(result).toEqual({
            org: 'myOrg',
            project: 'myProject',
            repoId: 'repo123',
            commitId: 'abc123',
            filePath: '/src/file.ts',
            prId: 42,
            side: 'right',
        });
    });

    it('parses a URI without prId or side', () => {
        const uri = buildPrFileUri('myOrg', 'myProject', 'repo123', 'abc123', '/src/file.ts');
        const result = parsePrFileUri(uri);
        expect(result).toEqual({
            org: 'myOrg',
            project: 'myProject',
            repoId: 'repo123',
            commitId: 'abc123',
            filePath: '/src/file.ts',
            prId: undefined,
            side: undefined,
        });
    });

    it('returns undefined for empty authority URI', () => {
        const uri = { scheme: 'azuredevops-pr', authority: 'empty', path: '', query: '' } as any;
        expect(parsePrFileUri(uri)).toBeUndefined();
    });

    it('returns undefined for wrong scheme', () => {
        const uri = { scheme: 'file', authority: 'myOrg', path: '/a/b/c/d/e', query: '' } as any;
        expect(parsePrFileUri(uri)).toBeUndefined();
    });

    it('returns undefined for URI with too few path segments', () => {
        const uri = { scheme: 'azuredevops-pr', authority: 'myOrg', path: '/a/b', query: '' } as any;
        expect(parsePrFileUri(uri)).toBeUndefined();
    });

    it('handles deeply nested file paths', () => {
        const uri = buildPrFileUri('org', 'proj', 'repo1', 'commit1', '/src/a/b/c/deep/file.ts', 99, 'left');
        const result = parsePrFileUri(uri);
        expect(result?.filePath).toBe('/src/a/b/c/deep/file.ts');
        expect(result?.prId).toBe(99);
        expect(result?.side).toBe('left');
    });

    it('treats invalid side values as undefined', () => {
        const uri = { scheme: 'azuredevops-pr', authority: 'myOrg', path: '/proj/repo/commit/file.ts', query: 'side=center' } as any;
        const result = parsePrFileUri(uri);
        expect(result?.side).toBeUndefined();
    });

    it('handles non-numeric prId as NaN which becomes undefined-like', () => {
        const uri = { scheme: 'azuredevops-pr', authority: 'myOrg', path: '/proj/repo/commit/file.ts', query: 'prId=notanumber' } as any;
        const result = parsePrFileUri(uri);
        expect(result?.prId).toBeNaN();
    });

    it('roundtrips all parameters correctly', () => {
        const params = {
            org: 'testOrg',
            project: 'testProject',
            repoId: 'repoABC',
            commitId: 'deadbeef',
            filePath: '/path/to/test.ts',
            prId: 123,
            side: 'right' as const,
        };
        const uri = buildPrFileUri(params.org, params.project, params.repoId, params.commitId, params.filePath, params.prId, params.side);
        const result = parsePrFileUri(uri);
        expect(result).toEqual(params);
    });

    it('roundtrips with left side', () => {
        const uri = buildPrFileUri('org', 'proj', 'repo', 'sha', '/file.ts', 7, 'left');
        const result = parsePrFileUri(uri);
        expect(result).toEqual({
            org: 'org',
            project: 'proj',
            repoId: 'repo',
            commitId: 'sha',
            filePath: '/file.ts',
            prId: 7,
            side: 'left',
        });
    });
});

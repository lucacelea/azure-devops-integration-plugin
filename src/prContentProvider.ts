import * as vscode from 'vscode';
import { getFileContent } from './api';
import { getToken } from './auth';

export class PrContentProvider implements vscode.TextDocumentContentProvider {
    private secretStorage: vscode.SecretStorage;

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        if (uri.authority === 'empty') {
            return '';
        }

        // URI format: azuredevops-pr://org/project/repoId/commitId/filePath
        const org = uri.authority;
        const parts = uri.path.split('/');
        // parts[0] is empty (leading slash), parts[1] = project, parts[2] = repoId, parts[3] = commitId, rest = filePath
        const project = decodeURIComponent(parts[1]);
        const repoId = parts[2];
        const commitId = parts[3];
        const filePath = '/' + parts.slice(4).join('/');

        const token = await getToken(this.secretStorage);
        if (!token) {
            throw new Error('No PAT configured');
        }

        return await getFileContent(org, project, repoId, filePath, commitId, token);
    }
}

export function buildPrFileUri(
    org: string, project: string, repoId: string, commitId: string, filePath: string,
    prId?: number, side?: 'left' | 'right'
): vscode.Uri {
    const base = `azuredevops-pr://${encodeURIComponent(org)}/${encodeURIComponent(project)}/${repoId}/${commitId}${filePath}`;
    const params = new URLSearchParams();
    if (prId !== undefined) { params.set('prId', String(prId)); }
    if (side) { params.set('side', side); }
    const query = params.toString();
    if (query) {
        return vscode.Uri.parse(base).with({ query });
    }
    return vscode.Uri.parse(base);
}

export interface PrFileUriContext {
    org: string;
    project: string;
    repoId: string;
    commitId: string;
    filePath: string;
    prId?: number;
    side?: 'left' | 'right';
}

export function parsePrFileUri(uri: vscode.Uri): PrFileUriContext | undefined {
    if (uri.scheme !== 'azuredevops-pr' || uri.authority === 'empty') {
        return undefined;
    }
    const org = decodeURIComponent(uri.authority);
    const parts = uri.path.split('/');
    // parts[0] is empty (leading slash), parts[1] = project, parts[2] = repoId, parts[3] = commitId, rest = filePath
    if (parts.length < 5) {
        return undefined;
    }
    const project = decodeURIComponent(parts[1]);
    const repoId = parts[2];
    const commitId = parts[3];
    const filePath = '/' + parts.slice(4).join('/');

    const queryParams = new URLSearchParams(uri.query);
    const prIdStr = queryParams.get('prId');
    const prId = prIdStr ? parseInt(prIdStr, 10) : undefined;
    const sideStr = queryParams.get('side');
    const side = (sideStr === 'left' || sideStr === 'right') ? sideStr : undefined;

    return { org, project, repoId, commitId, filePath, prId, side };
}

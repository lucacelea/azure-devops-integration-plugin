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
    org: string, project: string, repoId: string, commitId: string, filePath: string
): vscode.Uri {
    return vscode.Uri.parse(
        `azuredevops-pr://${encodeURIComponent(org)}/${encodeURIComponent(project)}/${repoId}/${commitId}${filePath}`
    );
}

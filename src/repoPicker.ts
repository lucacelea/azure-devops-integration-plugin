import * as vscode from 'vscode';
import { getCurrentBranch, getRemoteUrl } from './git';
import { parseRemoteUrl } from './config';

export interface RepoPickerResult {
    folder: vscode.WorkspaceFolder;
    branch: string;
}

export async function pickRepository(): Promise<RepoPickerResult | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return undefined;
    }

    // Resolve remote URLs and branches for all folders in parallel
    const resolved = await Promise.all(
        folders.map(async (folder) => {
            const cwd = folder.uri.fsPath;
            const [remoteUrl, branch] = await Promise.all([
                getRemoteUrl(cwd),
                getCurrentBranch(cwd),
            ]);
            const isAzureDevOps = remoteUrl
                ? !!parseRemoteUrl(remoteUrl).organization
                : false;
            return { folder, branch, isAzureDevOps };
        }),
    );

    const valid = resolved.filter((r) => r.isAzureDevOps);

    if (valid.length === 0) {
        vscode.window.showErrorMessage(
            'No workspace folder has an Azure DevOps remote.',
        );
        return undefined;
    }

    if (valid.length === 1) {
        return {
            folder: valid[0].folder,
            branch: valid[0].branch ?? '',
        };
    }

    const items = valid.map((r) => ({
        label: r.folder.name,
        description: r.branch ?? '',
        iconPath: new vscode.ThemeIcon('repo'),
        folder: r.folder,
        branch: r.branch ?? '',
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Choose a repository',
        placeHolder: 'Choose a repository',
    });

    if (!picked) {
        return undefined;
    }

    return { folder: picked.folder, branch: picked.branch };
}

import * as vscode from 'vscode';

let activeFolder: vscode.WorkspaceFolder | undefined;

const onDidChangeFolderEmitter = new vscode.EventEmitter<vscode.WorkspaceFolder | undefined>();

/** Fires when the user switches the active workspace folder via the picker. */
export const onDidChangeActiveFolder = onDidChangeFolderEmitter.event;

/**
 * Returns the currently active workspace folder.
 *
 * - Single-folder workspace: always returns that folder (no picker needed).
 * - Multi-root workspace: returns the last selected folder, or the first
 *   folder if no explicit selection has been made.
 * - No workspace: returns `undefined`.
 */
export function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    if (folders.length === 1) {
        return folders[0];
    }
    // Multi-root: use last selection, or default to first
    if (activeFolder && folders.includes(activeFolder)) {
        return activeFolder;
    }
    return folders[0];
}

/**
 * Shows a QuickPick so the user can choose which workspace folder (repository)
 * to use for Azure DevOps operations. Analogous to the built-in VS Code Git
 * branch picker that appears in multi-root workspaces.
 *
 * Returns the selected folder, or `undefined` if cancelled.
 */
export async function selectRepository(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('No workspace folders open.');
        return undefined;
    }
    if (folders.length === 1) {
        vscode.window.showInformationMessage('Only one repository is open.');
        return folders[0];
    }

    const current = getActiveWorkspaceFolder();
    const items = folders.map(f => ({
        label: f.name,
        description: f.uri.fsPath,
        detail: f === current ? '$(check) Active' : undefined,
        folder: f,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select the repository to use for Azure DevOps operations',
    });

    if (picked) {
        activeFolder = picked.folder;
        onDidChangeFolderEmitter.fire(activeFolder);
        return activeFolder;
    }
    return undefined;
}

/**
 * Resets the active folder selection (useful for testing).
 */
export function resetActiveFolder(): void {
    activeFolder = undefined;
}

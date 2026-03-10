import * as vscode from 'vscode';
import { exec } from 'child_process';

function getWorkspaceFolder(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function runGitCommand(command: string): Promise<string | undefined> {
    const cwd = getWorkspaceFolder();
    if (!cwd) {
        return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
        exec(command, { cwd, encoding: 'utf-8' }, (error, stdout) => {
            if (error) {
                resolve(undefined);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

export async function getCurrentBranch(): Promise<string | undefined> {
    return runGitCommand('git rev-parse --abbrev-ref HEAD');
}

export async function getDefaultBranch(): Promise<string> {
    const result = await runGitCommand('git symbolic-ref refs/remotes/origin/HEAD');
    if (result) {
        const parts = result.split('/');
        return parts[parts.length - 1];
    }
    return 'main';
}

export async function getRepositoryRoot(): Promise<string | undefined> {
    return runGitCommand('git rev-parse --show-toplevel');
}

export async function getRemoteUrl(): Promise<string | undefined> {
    return runGitCommand('git remote get-url origin');
}

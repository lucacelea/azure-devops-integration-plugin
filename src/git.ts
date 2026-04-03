import * as vscode from 'vscode';
import { exec } from 'child_process';

function getWorkspaceFolder(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function runGitCommand(command: string, overrideCwd?: string): Promise<string | undefined> {
    const cwd = overrideCwd ?? getWorkspaceFolder();
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

export async function getCurrentBranch(cwd?: string): Promise<string | undefined> {
    return runGitCommand('git rev-parse --abbrev-ref HEAD', cwd);
}

export async function getDefaultBranch(cwd?: string): Promise<string> {
    const result = await runGitCommand('git symbolic-ref refs/remotes/origin/HEAD', cwd);
    if (result) {
        const parts = result.split('/');
        return parts[parts.length - 1];
    }
    return 'main';
}

export async function getRepositoryRoot(cwd?: string): Promise<string | undefined> {
    return runGitCommand('git rev-parse --show-toplevel', cwd);
}

export async function getRemoteUrl(cwd?: string): Promise<string | undefined> {
    return runGitCommand('git remote get-url origin', cwd);
}

export async function branchExistsOnRemote(branch: string, cwd?: string): Promise<boolean> {
    const result = await runGitCommand(`git ls-remote --heads origin ${branch}`, cwd);
    return result !== undefined && result.length > 0;
}

export async function pushBranchToRemote(branch: string, cwd?: string): Promise<boolean> {
    const workDir = cwd ?? getWorkspaceFolder();
    if (!workDir) {
        return false;
    }
    return new Promise((resolve) => {
        exec(`git push -u origin ${branch}`, { cwd: workDir }, (error) => {
            resolve(!error);
        });
    });
}

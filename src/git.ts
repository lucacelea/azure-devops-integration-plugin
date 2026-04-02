import { exec } from 'child_process';
import { getActiveWorkspaceFolder } from './repoSelector';

function getWorkspaceFolder(): string | undefined {
    return getActiveWorkspaceFolder()?.uri.fsPath;
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

export async function branchExistsOnRemote(branch: string): Promise<boolean> {
    const result = await runGitCommand(`git ls-remote --heads origin ${branch}`);
    return result !== undefined && result.length > 0;
}

export async function pushBranchToRemote(branch: string): Promise<boolean> {
    const cwd = getWorkspaceFolder();
    if (!cwd) {
        return false;
    }
    return new Promise((resolve) => {
        exec(`git push -u origin ${branch}`, { cwd }, (error) => {
            resolve(!error);
        });
    });
}

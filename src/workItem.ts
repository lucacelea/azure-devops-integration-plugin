import * as vscode from 'vscode';
import { getCurrentBranch } from './git';

const DEFAULT_PATTERNS: RegExp[] = [
    /AB#(\d+)/,
    /^(?:feature|bugfix|hotfix|fix|task|chore)\/(\d+)/,
    /^(\d+)/,
];

export async function getWorkItemId(): Promise<string | undefined> {
    const branch = await getCurrentBranch();
    if (!branch) {
        return undefined;
    }

    const config = vscode.workspace.getConfiguration('azureDevops');
    const branchPrefix = config.get<string>('branchPrefix');
    const workItemPattern = config.get<string>('workItemPattern');

    let subject = branch;
    if (branchPrefix && subject.startsWith(branchPrefix)) {
        subject = subject.slice(branchPrefix.length);
    }

    if (workItemPattern) {
        try {
            const match = subject.match(new RegExp(workItemPattern));
            return match?.[1];
        } catch {
            return undefined;
        }
    }

    for (const pattern of DEFAULT_PATTERNS) {
        const match = subject.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return undefined;
}

import * as vscode from 'vscode';
import { getCurrentBranch } from './git';

const DEFAULT_PATTERNS: RegExp[] = [
    /#(\d+)/,
    /^(?:feature|bugfix|hotfix|fix|task|chore)\/(\d+)/,
    /^(\d+)/,
];

export async function getWorkItemId(cwd?: string): Promise<string | undefined> {
    const branch = await getCurrentBranch(cwd);
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

export function buildWorkItemUrl(org: string, project: string, workItemId: number | string): string {
    return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${encodeURIComponent(String(workItemId))}`;
}

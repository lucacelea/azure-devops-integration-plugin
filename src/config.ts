import * as vscode from 'vscode';
import { getRemoteUrl } from './git';

export interface DevOpsConfig {
    organization: string;
    project: string;
    repository: string;
}

interface ParsedRemote {
    organization?: string;
    project?: string;
    repository?: string;
}

function parseRemoteUrl(url: string): ParsedRemote {
    // HTTPS: https://dev.azure.com/{org}/{project}/_git/{repo}
    const httpsMatch = url.match(/https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/\s]+)/);
    if (httpsMatch) {
        return {
            organization: httpsMatch[1],
            project: httpsMatch[2],
            repository: httpsMatch[3],
        };
    }

    // SSH: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
    const sshMatch = url.match(/git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/\s]+)/);
    if (sshMatch) {
        return {
            organization: sshMatch[1],
            project: sshMatch[2],
            repository: sshMatch[3],
        };
    }

    // Old HTTPS: https://{org}.visualstudio.com/{project}/_git/{repo}
    const oldHttpsMatch = url.match(/https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/\s]+)/);
    if (oldHttpsMatch) {
        return {
            organization: oldHttpsMatch[1],
            project: oldHttpsMatch[2],
            repository: oldHttpsMatch[3],
        };
    }

    return {};
}

export async function getOrganization(): Promise<string> {
    const settings = vscode.workspace.getConfiguration('azureDevops');
    let organization = settings.get<string>('organization') || '';

    if (!organization) {
        const remoteUrl = await getRemoteUrl();
        if (remoteUrl) {
            const parsed = parseRemoteUrl(remoteUrl);
            if (parsed.organization) {
                organization = parsed.organization;
            }
        }
    }

    if (!organization) {
        throw new Error(
            'Azure DevOps organization not configured. ' +
            'Please set azureDevops.organization in Settings ' +
            'or ensure your git remote "origin" points to an Azure DevOps repository.'
        );
    }

    return organization;
}

export async function getDevOpsConfig(): Promise<DevOpsConfig> {
    const settings = vscode.workspace.getConfiguration('azureDevops');
    let organization = settings.get<string>('organization') || '';
    let project = settings.get<string>('project') || '';
    let repository = settings.get<string>('repository') || '';

    // If any value is missing, try to auto-detect from git remote
    if (!organization || !project || !repository) {
        const remoteUrl = await getRemoteUrl();
        if (remoteUrl) {
            const parsed = parseRemoteUrl(remoteUrl);
            if (!organization && parsed.organization) {
                organization = parsed.organization;
            }
            if (!project && parsed.project) {
                project = parsed.project;
            }
            if (!repository && parsed.repository) {
                repository = parsed.repository;
            }
        }
    }

    if (!organization || !project || !repository) {
        const missing: string[] = [];
        if (!organization) { missing.push('organization'); }
        if (!project) { missing.push('project'); }
        if (!repository) { missing.push('repository'); }
        throw new Error(
            `Azure DevOps configuration incomplete: missing ${missing.join(', ')}. ` +
            `Please set them in Settings (azureDevops.organization, azureDevops.project, azureDevops.repository) ` +
            `or ensure your git remote "origin" points to an Azure DevOps repository.`
        );
    }

    return { organization, project, repository };
}

export function getBaseUrl(config: DevOpsConfig): string {
    return `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_git/${encodeURIComponent(config.repository)}`;
}

export function getProjectUrl(config: DevOpsConfig): string {
    return `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}`;
}

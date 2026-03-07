import * as vscode from 'vscode';
import { getDevOpsConfig, getBaseUrl } from '../config';

export async function openRepository(): Promise<void> {
    try {
        let config;
        try {
            config = await getDevOpsConfig();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get Azure DevOps configuration: ${error instanceof Error ? error.message : error}`);
            return;
        }

        const url = getBaseUrl(config);
        await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open repository: ${error instanceof Error ? error.message : error}`);
    }
}

import * as vscode from 'vscode';
import { getDevOpsConfig, getProjectUrl } from '../config';
import { getWorkItemId } from '../workItem';

export async function openWorkItem(): Promise<void> {
    try {
        let config;
        try {
            config = await getDevOpsConfig();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get Azure DevOps configuration: ${error instanceof Error ? error.message : error}`);
            return;
        }

        const defaultId = await getWorkItemId();

        const id = await vscode.window.showInputBox({
            prompt: 'Enter work item ID',
            value: defaultId || '',
            validateInput: (v) => v === '' || /^\d+$/.test(v) ? null : 'Please enter a numeric ID',
        });

        if (!id) {
            return;
        }

        const url = `${getProjectUrl(config)}/_workitems/edit/${id}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open work item: ${error instanceof Error ? error.message : error}`);
    }
}

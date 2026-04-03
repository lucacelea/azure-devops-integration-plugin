import * as vscode from 'vscode';
import { getOrganization, getWorkItemProject } from '../config';
import { getWorkItemId, buildWorkItemUrl } from '../workItem';

export async function openWorkItem(): Promise<void> {
    try {
        const [org, project] = await Promise.all([
            getOrganization(),
            getWorkItemProject(),
        ]);

        const defaultId = await getWorkItemId();

        const id = await vscode.window.showInputBox({
            prompt: 'Enter work item ID',
            value: defaultId || '',
            validateInput: (v) => v === '' || /^\d+$/.test(v) ? null : 'Please enter a numeric ID',
        });

        if (!id) {
            return;
        }

        const url = buildWorkItemUrl(org, project, id);
        await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
        vscode.window.showErrorMessage(`${error instanceof Error ? error.message : error}`);
    }
}

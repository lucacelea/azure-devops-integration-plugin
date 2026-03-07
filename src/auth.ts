import * as vscode from 'vscode';

const SECRET_KEY = 'azureDevops.pat';

export async function setToken(secretStorage: vscode.SecretStorage): Promise<void> {
    const token = await vscode.window.showInputBox({
        password: true,
        prompt: 'Enter your Azure DevOps Personal Access Token',
    });

    if (token) {
        await secretStorage.store(SECRET_KEY, token);
        vscode.window.showInformationMessage('Azure DevOps PAT saved successfully.');
    }
}

export async function removeToken(secretStorage: vscode.SecretStorage): Promise<void> {
    await secretStorage.delete(SECRET_KEY);
    vscode.window.showInformationMessage('Azure DevOps PAT removed.');
}

export async function getToken(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
    return secretStorage.get(SECRET_KEY);
}

import * as vscode from 'vscode';

const SECRET_KEY = 'azureDevops.pat';

/** Azure DevOps resource ID used as the OAuth scope. */
const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

export type AuthMethod = 'pat' | 'azureAd';

/**
 * Returns the authentication method chosen by the user.
 * Defaults to `'pat'` when the setting is absent or unrecognised.
 */
export function getConfiguredAuthMethod(): AuthMethod {
    const raw = vscode.workspace
        .getConfiguration('azureDevops')
        .get<string>('authMethod', 'pat');
    return raw === 'azureAd' ? 'azureAd' : 'pat';
}

// ── PAT helpers ──────────────────────────────────────────────

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

// ── Azure AD helpers ─────────────────────────────────────────

/**
 * Start an interactive Azure AD login via VS Code's built-in
 * Microsoft authentication provider.
 * Returns `true` when a session was obtained successfully.
 */
export async function loginWithAzureAd(): Promise<boolean> {
    try {
        const session = await vscode.authentication.getSession(
            'microsoft',
            [AZURE_DEVOPS_SCOPE],
            { createIfNone: true },
        );
        if (session) {
            vscode.window.showInformationMessage(
                `Signed in to Azure DevOps as ${session.account.label}.`,
            );
            return true;
        }
    } catch {
        // user cancelled or provider unavailable
    }
    return false;
}

/**
 * Clear the Azure AD session used by this extension.
 */
export async function logoutFromAzureAd(): Promise<void> {
    try {
        const session = await vscode.authentication.getSession(
            'microsoft',
            [AZURE_DEVOPS_SCOPE],
            { createIfNone: false },
        );
        if (session) {
            // VS Code does not expose a direct "logout" API, but we can
            // inform the user.  In many environments removing consent or
            // signing out of VS Code's Microsoft account is the way to
            // fully revoke the session.
            vscode.window.showInformationMessage(
                'To fully sign out, remove the Microsoft account from VS Code\'s Accounts menu.',
            );
        } else {
            vscode.window.showInformationMessage('No Azure AD session found.');
        }
    } catch {
        vscode.window.showInformationMessage('No Azure AD session found.');
    }
}

// ── Unified token accessor ──────────────────────────────────

/**
 * Returns an access token string for the configured authentication
 * method, or `undefined` when no credentials are available.
 *
 * - `pat`     → reads the stored PAT from SecretStorage.
 * - `azureAd` → obtains a session via VS Code's Microsoft
 *               authentication provider (without prompting).
 */
export async function getToken(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
    if (getConfiguredAuthMethod() === 'azureAd') {
        try {
            const session = await vscode.authentication.getSession(
                'microsoft',
                [AZURE_DEVOPS_SCOPE],
                { createIfNone: false },
            );
            return session?.accessToken;
        } catch {
            return undefined;
        }
    }
    return secretStorage.get(SECRET_KEY);
}

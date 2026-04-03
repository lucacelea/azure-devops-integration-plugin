import * as vscode from 'vscode';

const SECRET_KEY = 'azureDevops.pat';

/** Azure DevOps resource ID used as the OAuth scope. */
const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

const AUTH_REQUIRED_MESSAGE = 'Not authenticated. Sign in with Azure AD or set a Personal Access Token.';
const resolvedMethodByToken = new Map<string, ResolvedAuthMethod>();

export type AuthMethod = 'auto' | 'pat' | 'azureAd';
export type ResolvedAuthMethod = 'pat' | 'azureAd';

export interface AuthSession {
    token: string;
    method: ResolvedAuthMethod;
    accountLabel?: string;
}

/**
 * Returns the authentication method chosen by the user.
 * Defaults to `'auto'` when the setting is absent or unrecognised.
 */
export function getConfiguredAuthMethod(): AuthMethod {
    const raw = vscode.workspace
        .getConfiguration('azureDevops')
        .get<string>('authMethod', 'auto');
    if (raw === 'pat' || raw === 'azureAd' || raw === 'auto') {
        return raw;
    }
    return 'auto';
}

async function setConfiguredAuthMethod(method: AuthMethod): Promise<void> {
    await vscode.workspace
        .getConfiguration('azureDevops')
        .update('authMethod', method, vscode.ConfigurationTarget.Global);
}

function rememberResolvedMethod(token: string, method: ResolvedAuthMethod): void {
    resolvedMethodByToken.set(token, method);
}

async function getAzureAdSession(createIfNone: boolean): Promise<AuthSession | undefined> {
    try {
        const session = await vscode.authentication.getSession(
            'microsoft',
            [AZURE_DEVOPS_SCOPE],
            { createIfNone },
        );
        if (!session?.accessToken) {
            return undefined;
        }
        rememberResolvedMethod(session.accessToken, 'azureAd');
        return {
            token: session.accessToken,
            method: 'azureAd',
            accountLabel: session.account.label,
        };
    } catch {
        return undefined;
    }
}

async function getPatSession(secretStorage: vscode.SecretStorage): Promise<AuthSession | undefined> {
    const token = await secretStorage.get(SECRET_KEY);
    if (!token) {
        return undefined;
    }
    rememberResolvedMethod(token, 'pat');
    return {
        token,
        method: 'pat',
    };
}

// ── PAT helpers ──────────────────────────────────────────────

export async function setToken(secretStorage: vscode.SecretStorage): Promise<void> {
    const token = await vscode.window.showInputBox({
        password: true,
        prompt: 'Enter your Azure DevOps Personal Access Token',
    });

    if (token) {
        await secretStorage.store(SECRET_KEY, token);
        rememberResolvedMethod(token, 'pat');
        if (getConfiguredAuthMethod() !== 'auto') {
            await setConfiguredAuthMethod('auto');
            vscode.window.showInformationMessage('Azure DevOps PAT saved. Authentication mode set to automatic.');
            return;
        }
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
    const session = await getAzureAdSession(true);
    if (!session) {
        return false;
    }

    if (getConfiguredAuthMethod() !== 'auto') {
        await setConfiguredAuthMethod('auto');
        vscode.window.showInformationMessage(
            `Signed in to Azure DevOps as ${session.accountLabel}. Authentication mode set to automatic.`,
        );
        return true;
    }

    vscode.window.showInformationMessage(
        `Signed in to Azure DevOps as ${session.accountLabel}.`,
    );
    return true;
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
 * - `auto`    → prefers Azure AD when already signed in,
 *               then falls back to a stored PAT.
 */
export async function getAuthSession(secretStorage: vscode.SecretStorage): Promise<AuthSession | undefined> {
    const method = getConfiguredAuthMethod();
    if (method === 'azureAd') {
        return getAzureAdSession(false);
    }
    if (method === 'pat') {
        return getPatSession(secretStorage);
    }

    const azureAdSession = await getAzureAdSession(false);
    if (azureAdSession) {
        return azureAdSession;
    }

    return getPatSession(secretStorage);
}

export async function getToken(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
    return (await getAuthSession(secretStorage))?.token;
}

export function getResolvedAuthMethodForToken(token: string): ResolvedAuthMethod | undefined {
    return resolvedMethodByToken.get(token);
}

export function getAuthenticationRequiredMessage(): string {
    return AUTH_REQUIRED_MESSAGE;
}

export async function configureAuthentication(secretStorage: vscode.SecretStorage): Promise<void> {
    const picked = await vscode.window.showQuickPick(
        [
            {
                label: 'Sign in with Azure AD',
                description: 'Recommended',
                action: 'azureAd' as const,
            },
            {
                label: 'Set Personal Access Token',
                description: 'Use a PAT instead',
                action: 'pat' as const,
            },
        ],
        {
            placeHolder: 'Choose how to authenticate with Azure DevOps',
        },
    );

    if (!picked) {
        return;
    }

    if (picked.action === 'azureAd') {
        const ok = await loginWithAzureAd();
        if (!ok) {
            vscode.window.showWarningMessage('Azure AD sign-in was cancelled or unavailable.');
        }
        return;
    }

    await setToken(secretStorage);
}

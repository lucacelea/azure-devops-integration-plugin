import * as vscode from 'vscode';
import { getConfiguredAuthMethod, getToken, loginWithAzureAd } from '../auth';

// Reset all mocks between tests
beforeEach(() => {
    jest.restoreAllMocks();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
        update: jest.fn().mockResolvedValue(undefined),
    });
    (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);
});

function mockAuthMethod(method: string) {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === 'authMethod') { return method; }
            return defaultValue;
        }),
        update: jest.fn().mockResolvedValue(undefined),
    });
}

describe('getConfiguredAuthMethod', () => {
    it('defaults to auto when setting is absent', () => {
        expect(getConfiguredAuthMethod()).toBe('auto');
    });

    it('returns auto when setting is auto', () => {
        mockAuthMethod('auto');
        expect(getConfiguredAuthMethod()).toBe('auto');
    });

    it('returns azureAd when setting is azureAd', () => {
        mockAuthMethod('azureAd');
        expect(getConfiguredAuthMethod()).toBe('azureAd');
    });

    it('returns auto for unrecognised values', () => {
        mockAuthMethod('unknown');
        expect(getConfiguredAuthMethod()).toBe('auto');
    });
});

describe('getToken', () => {
    it('reads from SecretStorage when auth method is pat', async () => {
        mockAuthMethod('pat');
        const secretStorage = { get: jest.fn().mockResolvedValue('my-pat') } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBe('my-pat');
        expect(secretStorage.get).toHaveBeenCalledWith('azureDevops.pat');
    });

    it('returns undefined when no PAT is stored in pat mode', async () => {
        mockAuthMethod('pat');
        const secretStorage = { get: jest.fn().mockResolvedValue(undefined) } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBeUndefined();
    });

    it('returns Azure AD access token when auth method is azureAd', async () => {
        mockAuthMethod('azureAd');
        (vscode.authentication.getSession as jest.Mock).mockResolvedValue({
            accessToken: 'ad-token-123',
            account: { label: 'user@example.com' },
        });

        const secretStorage = { get: jest.fn() } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBe('ad-token-123');
    });

    it('returns undefined when Azure AD session is not available', async () => {
        mockAuthMethod('azureAd');
        (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

        const secretStorage = { get: jest.fn() } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBeUndefined();
    });

    it('prefers Azure AD in auto mode when a session exists', async () => {
        mockAuthMethod('auto');
        (vscode.authentication.getSession as jest.Mock).mockResolvedValue({
            accessToken: 'ad-token-123',
            account: { label: 'user@example.com' },
        });

        const secretStorage = { get: jest.fn().mockResolvedValue('my-pat') } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBe('ad-token-123');
        expect(secretStorage.get).not.toHaveBeenCalled();
    });

    it('falls back to PAT in auto mode when Azure AD is unavailable', async () => {
        mockAuthMethod('auto');
        (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

        const secretStorage = { get: jest.fn().mockResolvedValue('my-pat') } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBe('my-pat');
        expect(secretStorage.get).toHaveBeenCalledWith('azureDevops.pat');
    });

    it('returns undefined when Azure AD getSession throws', async () => {
        mockAuthMethod('azureAd');
        (vscode.authentication.getSession as jest.Mock).mockRejectedValue(new Error('provider unavailable'));

        const secretStorage = { get: jest.fn() } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBeUndefined();
    });
});

describe('loginWithAzureAd', () => {
    it('returns true and shows message on successful login', async () => {
        mockAuthMethod('auto');
        (vscode.authentication.getSession as jest.Mock).mockResolvedValue({
            accessToken: 'token',
            account: { label: 'user@corp.com' },
        });
        const result = await loginWithAzureAd();
        expect(result).toBe(true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('user@corp.com'),
        );
    });

    it('switches pat mode to auto after successful login', async () => {
        const update = jest.fn().mockResolvedValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === 'authMethod') { return 'pat'; }
                return defaultValue;
            }),
            update,
        });
        (vscode.authentication.getSession as jest.Mock).mockResolvedValue({
            accessToken: 'token',
            account: { label: 'user@corp.com' },
        });

        const result = await loginWithAzureAd();
        expect(result).toBe(true);
        expect(update).toHaveBeenCalledWith('authMethod', 'auto', vscode.ConfigurationTarget.Global);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('Authentication mode set to automatic'),
        );
    });

    it('returns false when user cancels login', async () => {
        (vscode.authentication.getSession as jest.Mock).mockRejectedValue(new Error('cancelled'));
        const result = await loginWithAzureAd();
        expect(result).toBe(false);
    });

    it('returns false when getSession returns undefined', async () => {
        (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);
        const result = await loginWithAzureAd();
        expect(result).toBe(false);
    });
});

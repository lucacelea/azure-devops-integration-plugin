import * as vscode from 'vscode';
import { getConfiguredAuthMethod, getToken, loginWithAzureAd } from '../auth';

// Reset all mocks between tests
beforeEach(() => {
    jest.restoreAllMocks();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
    });
    (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);
});

function mockAuthMethod(method: string) {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === 'authMethod') { return method; }
            return defaultValue;
        }),
    });
}

describe('getConfiguredAuthMethod', () => {
    it('defaults to pat when setting is absent', () => {
        expect(getConfiguredAuthMethod()).toBe('pat');
    });

    it('returns azureAd when setting is azureAd', () => {
        mockAuthMethod('azureAd');
        expect(getConfiguredAuthMethod()).toBe('azureAd');
    });

    it('returns pat for unrecognised values', () => {
        mockAuthMethod('unknown');
        expect(getConfiguredAuthMethod()).toBe('pat');
    });
});

describe('getToken', () => {
    it('reads from SecretStorage when auth method is pat', async () => {
        const secretStorage = { get: jest.fn().mockResolvedValue('my-pat') } as unknown as vscode.SecretStorage;
        const token = await getToken(secretStorage);
        expect(token).toBe('my-pat');
        expect(secretStorage.get).toHaveBeenCalledWith('azureDevops.pat');
    });

    it('returns undefined when no PAT is stored', async () => {
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

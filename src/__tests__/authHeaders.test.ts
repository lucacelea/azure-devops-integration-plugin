import * as vscode from 'vscode';

beforeEach(() => {
    jest.restoreAllMocks();
    // Default to PAT auth
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
    });
});

describe('authHeaders', () => {
    it('produces Basic auth header for PAT method', () => {
        const { authHeaders } = require('../api');
        const headers = authHeaders('my-pat-token');
        expect(headers['Authorization']).toMatch(/^Basic /);
        expect(headers['Accept']).toBe('application/json');

        // Verify the Basic auth encodes ":token" correctly
        const encoded = headers['Authorization'].replace('Basic ', '');
        const decoded = Buffer.from(encoded, 'base64').toString();
        expect(decoded).toBe(':my-pat-token');
    });

    it('produces Bearer auth header for Azure AD method', () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === 'authMethod') { return 'azureAd'; }
                return defaultValue;
            }),
        });
        const { authHeaders } = require('../api');
        const headers = authHeaders('ad-access-token');
        expect(headers['Authorization']).toBe('Bearer ad-access-token');
        expect(headers['Accept']).toBe('application/json');
    });
});

import * as vscode from 'vscode';
import { createStatusBarItem } from '../statusBar';

jest.mock('vscode');

jest.mock('../workItem', () => ({
    getWorkItemId: jest.fn(),
}));

jest.mock('../git', () => ({
    getRepositoryRoot: jest.fn(),
}));

const { getWorkItemId } = require('../workItem') as { getWorkItemId: jest.Mock };
const { getRepositoryRoot } = require('../git') as { getRepositoryRoot: jest.Mock };

function makeContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
    } as unknown as vscode.ExtensionContext;
}

describe('createStatusBarItem', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getWorkItemId.mockResolvedValue(undefined);
        getRepositoryRoot.mockResolvedValue(undefined);
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
    });

    it('creates a status bar item with openWorkItem command', () => {
        const ctx = makeContext();
        const item = createStatusBarItem(ctx);
        expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
            vscode.StatusBarAlignment.Left,
            100,
        );
        expect(item.command).toBe('azureDevops.openWorkItem');
    });

    it('shows work item text when getWorkItemId returns a value', async () => {
        getWorkItemId.mockResolvedValue('1234');
        const ctx = makeContext();
        const item = createStatusBarItem(ctx);
        // Wait for initial updateStatusBar to complete
        await new Promise(process.nextTick);
        expect(item.text).toBe('$(tag) WI #1234');
        expect(item.tooltip).toBe('Open work item #1234 in Azure DevOps');
        expect(item.show).toHaveBeenCalled();
    });

    it('hides when no work item is detected', async () => {
        getWorkItemId.mockResolvedValue(undefined);
        const ctx = makeContext();
        const item = createStatusBarItem(ctx);
        await new Promise(process.nextTick);
        expect(item.hide).toHaveBeenCalled();
    });

    it('registers onDidChangeConfiguration listener', () => {
        const ctx = makeContext();
        createStatusBarItem(ctx);
        expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    });

    it('does not use setInterval for polling', () => {
        const spy = jest.spyOn(global, 'setInterval');
        const ctx = makeContext();
        createStatusBarItem(ctx);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    describe('Git Extension API branch detection', () => {
        it('subscribes to repository state changes when git extension is available', async () => {
            const onDidChangeFn = jest.fn().mockReturnValue({ dispose: jest.fn() });
            const mockRepo = {
                state: {
                    HEAD: { name: 'main' },
                    onDidChange: onDidChangeFn,
                },
            };
            const mockApi = {
                repositories: [mockRepo],
                onDidOpenRepository: jest.fn(),
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
                isActive: true,
                exports: { getAPI: () => mockApi },
            });

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            expect(onDidChangeFn).toHaveBeenCalled();
        });

        it('triggers update when branch name changes via git extension', async () => {
            let stateChangeHandler: () => void;
            const onDidChangeFn = jest.fn().mockImplementation((handler: () => void) => {
                stateChangeHandler = handler;
                return { dispose: jest.fn() };
            });
            const mockRepo = {
                state: {
                    HEAD: { name: 'main' },
                    onDidChange: onDidChangeFn,
                },
            };
            const mockApi = {
                repositories: [mockRepo],
                onDidOpenRepository: jest.fn(),
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
                isActive: true,
                exports: { getAPI: () => mockApi },
            });

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            // Simulate branch change
            getWorkItemId.mockResolvedValue('5678');
            mockRepo.state.HEAD = { name: 'feature/5678-new-feature' };
            stateChangeHandler!();
            await new Promise(process.nextTick);

            const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
            expect(item.text).toBe('$(tag) WI #5678');
        });

        it('does not trigger update when branch name stays the same', async () => {
            let stateChangeHandler: () => void;
            const onDidChangeFn = jest.fn().mockImplementation((handler: () => void) => {
                stateChangeHandler = handler;
                return { dispose: jest.fn() };
            });
            const mockRepo = {
                state: {
                    HEAD: { name: 'main' },
                    onDidChange: onDidChangeFn,
                },
            };
            const mockApi = {
                repositories: [mockRepo],
                onDidOpenRepository: jest.fn(),
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
                isActive: true,
                exports: { getAPI: () => mockApi },
            });

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            getWorkItemId.mockClear();
            // Fire state change without changing branch name
            stateChangeHandler!();
            await new Promise(process.nextTick);

            // getWorkItemId should not be called again since branch didn't change
            expect(getWorkItemId).not.toHaveBeenCalled();
        });

        it('waits for repository when none is available initially', async () => {
            let openRepoHandler: (repo: any) => void;
            const onDidOpenRepository = jest.fn().mockImplementation((handler: (repo: any) => void) => {
                openRepoHandler = handler;
                return { dispose: jest.fn() };
            });
            const mockApi = {
                repositories: [],
                onDidOpenRepository,
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
                isActive: true,
                exports: { getAPI: () => mockApi },
            });

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            expect(onDidOpenRepository).toHaveBeenCalled();

            // Simulate repository becoming available
            const onDidChangeFn = jest.fn().mockReturnValue({ dispose: jest.fn() });
            const mockRepo = {
                state: {
                    HEAD: { name: 'feature/1234-test' },
                    onDidChange: onDidChangeFn,
                },
            };
            openRepoHandler!(mockRepo);

            expect(onDidChangeFn).toHaveBeenCalled();
        });

        it('activates git extension when not yet active', async () => {
            const onDidChangeFn = jest.fn().mockReturnValue({ dispose: jest.fn() });
            const mockRepo = {
                state: {
                    HEAD: { name: 'main' },
                    onDidChange: onDidChangeFn,
                },
            };
            const mockApi = {
                repositories: [mockRepo],
                onDidOpenRepository: jest.fn(),
            };
            const activateFn = jest.fn().mockResolvedValue({ getAPI: () => mockApi });
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
                isActive: false,
                exports: undefined,
                activate: activateFn,
            });

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            expect(activateFn).toHaveBeenCalled();
            expect(onDidChangeFn).toHaveBeenCalled();
        });
    });

    describe('File watcher fallback', () => {
        it('creates .git/HEAD file watcher when git extension is unavailable', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            getRepositoryRoot.mockResolvedValue('/fake/repo');

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
        });

        it('does not create watcher when no repository root found', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            getRepositoryRoot.mockResolvedValue(undefined);

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
        });

        it('falls back to file watcher when git extension throws', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockImplementation(() => {
                throw new Error('Extension not available');
            });
            getRepositoryRoot.mockResolvedValue('/fake/repo');

            const ctx = makeContext();
            createStatusBarItem(ctx);
            await new Promise(process.nextTick);

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
        });
    });
});

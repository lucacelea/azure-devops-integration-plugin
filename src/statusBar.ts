import * as vscode from 'vscode';
import { getWorkItemId } from './workItem';
import { getRepositoryRoot } from './git';

// Minimal types for the VS Code Git extension API
interface GitExtensionExports {
    getAPI(version: 1): GitAPI;
}

interface GitAPI {
    repositories: GitRepository[];
    onDidOpenRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
    state: {
        HEAD: { name?: string } | undefined;
        onDidChange: vscode.Event<void>;
    };
}

export function createStatusBarItem(context: vscode.ExtensionContext): vscode.StatusBarItem {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'azureDevops.openWorkItem';

    async function updateStatusBar(): Promise<void> {
        const id = await getWorkItemId();
        if (id) {
            statusBarItem.text = `$(tag) WI #${id}`;
            statusBarItem.tooltip = `Open work item #${id} in Azure DevOps`;
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    }

    // Initial update
    updateStatusBar();

    // Re-check on configuration changes
    const configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('azureDevops')) {
            updateStatusBar();
        }
    });

    context.subscriptions.push(statusBarItem, configDisposable);

    // Event-driven branch change detection
    subscribeToBranchChanges(context, updateStatusBar);

    return statusBarItem;
}

async function subscribeToBranchChanges(
    context: vscode.ExtensionContext,
    onBranchChange: () => Promise<void>,
): Promise<void> {
    // Try VS Code Git Extension API first
    try {
        const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
        if (gitExtension) {
            const git = gitExtension.isActive
                ? gitExtension.exports
                : await gitExtension.activate();
            const api = git.getAPI(1);

            function watchRepository(repo: GitRepository): void {
                let lastHead = repo.state.HEAD?.name;
                context.subscriptions.push(
                    repo.state.onDidChange(() => {
                        const currentHead = repo.state.HEAD?.name;
                        if (currentHead !== lastHead) {
                            lastHead = currentHead;
                            onBranchChange();
                        }
                    }),
                );
            }

            if (api.repositories.length > 0) {
                watchRepository(api.repositories[0]);
                return;
            }

            // Wait for a repository to open
            const repoDisposable = api.onDidOpenRepository((repo: GitRepository) => {
                watchRepository(repo);
                repoDisposable.dispose();
            });
            context.subscriptions.push(repoDisposable);
            return;
        }
    } catch {
        // Git extension not available, fall through to file watcher
    }

    // Fallback: watch .git/HEAD file for branch changes
    const root = await getRepositoryRoot();
    if (root) {
        const gitHeadPattern = new vscode.RelativePattern(root, '.git/HEAD');
        const watcher = vscode.workspace.createFileSystemWatcher(gitHeadPattern);
        const handler = () => { onBranchChange(); };
        watcher.onDidChange(handler);
        watcher.onDidCreate(handler);
        context.subscriptions.push(watcher);
    }
}

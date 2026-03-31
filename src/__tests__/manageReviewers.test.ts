import * as vscode from 'vscode';

// Mock API module
jest.mock('../api', () => ({
    getPullRequestDetails: jest.fn(),
    getTeamMembers: jest.fn(),
    addReviewer: jest.fn(),
    removeReviewer: jest.fn(),
    updateReviewerVote: jest.fn(),
    completePullRequest: jest.fn(),
    abandonPullRequest: jest.fn(),
    addPullRequestComment: jest.fn(),
}));

jest.mock('../auth', () => ({
    getToken: jest.fn(),
}));

jest.mock('../prLinks', () => ({
    buildPullRequestUrl: jest.fn(),
}));

import { registerPrActions } from '../commands/prActions';
import { PullRequestItem, PullRequestTreeProvider } from '../prSidebar';
import { getPullRequestDetails, getTeamMembers, addReviewer, removeReviewer } from '../api';
import { getToken } from '../auth';
import { EnrichedPullRequest } from '../api';

const mockGetPrDetails = getPullRequestDetails as jest.Mock;
const mockGetTeamMembers = getTeamMembers as jest.Mock;
const mockAddReviewer = addReviewer as jest.Mock;
const mockRemoveReviewer = removeReviewer as jest.Mock;
const mockGetToken = getToken as jest.Mock;
const mockShowQuickPick = vscode.window.showQuickPick as jest.Mock;
const mockShowInfoMessage = vscode.window.showInformationMessage as jest.Mock;
const mockShowErrorMessage = vscode.window.showErrorMessage as jest.Mock;

function makePr(overrides: Partial<EnrichedPullRequest> = {}): EnrichedPullRequest {
    return {
        pullRequestId: 42,
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature',
        createdBy: { displayName: 'Creator', id: 'creator-id' },
        reviewers: [
            { displayName: 'Alice', vote: 0, id: 'alice-id' },
        ],
        repository: { id: 'repo-1', name: 'my-repo', project: { id: 'proj-1', name: 'my-project' } },
        status: 'active',
        isDraft: false,
        url: 'https://dev.azure.com/org/project/_git/repo/pullrequest/42',
        unresolvedCommentCount: 0,
        checksStatus: 'none',
        checks: [],
        commentThreads: [],
        ...overrides,
    };
}

function makePrItem(pr: EnrichedPullRequest, org = 'my-org'): PullRequestItem {
    const item = new PullRequestItem(pr.title, vscode.TreeItemCollapsibleState.None);
    item.pr = pr;
    item.org = org;
    return item;
}

describe('Manage Reviewers command', () => {
    let registeredCommands: Map<string, (...args: unknown[]) => unknown>;
    let provider: PullRequestTreeProvider;

    beforeEach(() => {
        jest.clearAllMocks();
        registeredCommands = new Map();

        // Capture all registered commands
        (vscode.commands.registerCommand as jest.Mock).mockImplementation(
            (command: string, callback: (...args: unknown[]) => unknown) => {
                registeredCommands.set(command, callback);
                return { dispose: jest.fn() };
            }
        );

        provider = {
            refresh: jest.fn(),
            cachedUserId: 'user-1',
            secretStorage: {} as any,
        } as unknown as PullRequestTreeProvider;

        const context = {
            subscriptions: { push: jest.fn() },
        } as unknown as vscode.ExtensionContext;

        mockGetToken.mockResolvedValue('test-token');
        registerPrActions(context, provider);
    });

    async function invokeManageReviewers(pr: EnrichedPullRequest) {
        const handler = registeredCommands.get('azureDevops.manageReviewersPr');
        expect(handler).toBeDefined();
        await handler!(makePrItem(pr));
    }

    it('registers the manageReviewersPr command', () => {
        expect(registeredCommands.has('azureDevops.manageReviewersPr')).toBe(true);
    });

    it('adds a new reviewer when selected', async () => {
        const pr = makePr();
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [{ displayName: 'Alice', vote: 0, id: 'alice-id' }],
        });
        mockGetTeamMembers.mockResolvedValue([
            { id: 'alice-id', displayName: 'Alice' },
            { id: 'bob-id', displayName: 'Bob' },
        ]);
        // User selects both Alice and Bob
        mockShowQuickPick.mockResolvedValue([
            { label: 'Alice', description: 'Current reviewer', picked: true },
            { label: 'Bob', description: '', picked: false },
        ]);

        await invokeManageReviewers(pr);

        expect(mockAddReviewer).toHaveBeenCalledWith('my-org', 'my-project', 'repo-1', 42, 'bob-id', 'test-token');
        expect(mockRemoveReviewer).not.toHaveBeenCalled();
        expect(mockShowInfoMessage).toHaveBeenCalledWith('Reviewers updated: added 1.');
        expect(provider.refresh).toHaveBeenCalled();
    });

    it('removes a reviewer when deselected', async () => {
        const pr = makePr({
            reviewers: [
                { displayName: 'Alice', vote: 0, id: 'alice-id' },
                { displayName: 'Bob', vote: 0, id: 'bob-id' },
            ],
        });
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [
                { displayName: 'Alice', vote: 0, id: 'alice-id' },
                { displayName: 'Bob', vote: 0, id: 'bob-id' },
            ],
        });
        mockGetTeamMembers.mockResolvedValue([
            { id: 'alice-id', displayName: 'Alice' },
            { id: 'bob-id', displayName: 'Bob' },
        ]);
        // User deselects Bob, keeps Alice
        mockShowQuickPick.mockResolvedValue([
            { label: 'Alice', description: 'Current reviewer', picked: true },
        ]);

        await invokeManageReviewers(pr);

        expect(mockRemoveReviewer).toHaveBeenCalledWith('my-org', 'my-project', 'repo-1', 42, 'bob-id', 'test-token');
        expect(mockAddReviewer).not.toHaveBeenCalled();
        expect(mockShowInfoMessage).toHaveBeenCalledWith('Reviewers updated: removed 1.');
        expect(provider.refresh).toHaveBeenCalled();
    });

    it('adds and removes reviewers simultaneously', async () => {
        const pr = makePr({
            reviewers: [
                { displayName: 'Alice', vote: 0, id: 'alice-id' },
            ],
        });
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [{ displayName: 'Alice', vote: 0, id: 'alice-id' }],
        });
        mockGetTeamMembers.mockResolvedValue([
            { id: 'alice-id', displayName: 'Alice' },
            { id: 'bob-id', displayName: 'Bob' },
        ]);
        // User deselects Alice, selects Bob
        mockShowQuickPick.mockResolvedValue([
            { label: 'Bob', description: '', picked: false },
        ]);

        await invokeManageReviewers(pr);

        expect(mockAddReviewer).toHaveBeenCalledWith('my-org', 'my-project', 'repo-1', 42, 'bob-id', 'test-token');
        expect(mockRemoveReviewer).toHaveBeenCalledWith('my-org', 'my-project', 'repo-1', 42, 'alice-id', 'test-token');
        expect(mockShowInfoMessage).toHaveBeenCalledWith('Reviewers updated: added 1, removed 1.');
    });

    it('shows no-change message when selection is unchanged', async () => {
        const pr = makePr();
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [{ displayName: 'Alice', vote: 0, id: 'alice-id' }],
        });
        mockGetTeamMembers.mockResolvedValue([
            { id: 'alice-id', displayName: 'Alice' },
            { id: 'bob-id', displayName: 'Bob' },
        ]);
        // User keeps the same selection (Alice only)
        mockShowQuickPick.mockResolvedValue([
            { label: 'Alice', description: 'Current reviewer', picked: true },
        ]);

        await invokeManageReviewers(pr);

        expect(mockAddReviewer).not.toHaveBeenCalled();
        expect(mockRemoveReviewer).not.toHaveBeenCalled();
        expect(mockShowInfoMessage).toHaveBeenCalledWith('No reviewer changes made.');
    });

    it('does nothing when user cancels the quick pick', async () => {
        const pr = makePr();
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [{ displayName: 'Alice', vote: 0, id: 'alice-id' }],
        });
        mockGetTeamMembers.mockResolvedValue([
            { id: 'alice-id', displayName: 'Alice' },
        ]);
        mockShowQuickPick.mockResolvedValue(undefined);

        await invokeManageReviewers(pr);

        expect(mockAddReviewer).not.toHaveBeenCalled();
        expect(mockRemoveReviewer).not.toHaveBeenCalled();
        expect(mockShowInfoMessage).not.toHaveBeenCalled();
    });

    it('shows info message when no team members found', async () => {
        const pr = makePr({ reviewers: [] });
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [],
        });
        mockGetTeamMembers.mockResolvedValue([]);

        await invokeManageReviewers(pr);

        expect(mockShowInfoMessage).toHaveBeenCalledWith('No team members found to add as reviewers.');
        expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it('shows error message on API failure', async () => {
        const pr = makePr();
        mockGetPrDetails.mockRejectedValue(new Error('Network error'));

        await invokeManageReviewers(pr);

        expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to manage reviewers: Network error');
    });

    it('shows current reviewers not in team members list', async () => {
        const pr = makePr({
            reviewers: [{ displayName: 'External User', vote: 0, id: 'ext-id' }],
        });
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [{ displayName: 'External User', vote: 0, id: 'ext-id' }],
        });
        mockGetTeamMembers.mockResolvedValue([
            { id: 'team-id', displayName: 'Team Member' },
        ]);
        // User selects both
        mockShowQuickPick.mockResolvedValue([
            { label: 'External User', description: 'Current reviewer', picked: true },
            { label: 'Team Member', description: '', picked: false },
        ]);

        await invokeManageReviewers(pr);

        // External User was already a reviewer, Team Member is new
        expect(mockAddReviewer).toHaveBeenCalledWith('my-org', 'my-project', 'repo-1', 42, 'team-id', 'test-token');
        expect(mockRemoveReviewer).not.toHaveBeenCalled();
    });

    it('passes canPickMany and title to showQuickPick', async () => {
        const pr = makePr();
        mockGetPrDetails.mockResolvedValue({
            ...pr,
            reviewers: [{ displayName: 'Alice', vote: 0, id: 'alice-id' }],
        });
        mockGetTeamMembers.mockResolvedValue([
            { id: 'alice-id', displayName: 'Alice' },
        ]);
        mockShowQuickPick.mockResolvedValue([
            { label: 'Alice', description: 'Current reviewer', picked: true },
        ]);

        await invokeManageReviewers(pr);

        expect(mockShowQuickPick).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
                canPickMany: true,
                title: 'Manage Reviewers — PR #42',
            }),
        );
    });
});

import * as vscode from 'vscode';
import { PullRequestItem } from '../prSidebar';
import { EnrichedPullRequest, WorkItem } from '../api';

function makePr(overrides: Partial<EnrichedPullRequest> = {}): EnrichedPullRequest {
    return {
        pullRequestId: 1,
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature',
        createdBy: { displayName: 'User', id: 'user1' },
        reviewers: [],
        repository: { id: 'repo1', name: 'repo', project: { id: 'proj1', name: 'proj' } },
        status: 'active',
        isDraft: false,
        url: '',
        unresolvedCommentCount: 0,
        commentThreads: [],
        checksStatus: 'none',
        checks: [],
        workItems: [],
        ...overrides,
    };
}

describe('PullRequestItem.fromPullRequest with work items', () => {
    it('includes work items in the tooltip when present', () => {
        const workItems: WorkItem[] = [
            { id: 1234, title: 'Implement user authentication', state: 'Active', type: 'User Story' },
            { id: 5678, title: 'Fix login bug', state: 'New', type: 'Bug' },
        ];
        const pr = makePr({ workItems });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');
        const tooltipText = (item.tooltip as vscode.MarkdownString).value;

        expect(tooltipText).toContain('**Work Items:**');
        expect(tooltipText).toContain('AB#1234 \u2014 Implement user authentication');
        expect(tooltipText).toContain('AB#5678 \u2014 Fix login bug');
    });

    it('does not include work items section in tooltip when none are linked', () => {
        const pr = makePr({ workItems: [] });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');
        const tooltipText = (item.tooltip as vscode.MarkdownString).value;

        expect(tooltipText).not.toContain('Work Items:');
    });

    it('creates expandable item with a work items summary when work items are present', () => {
        const workItems: WorkItem[] = [
            { id: 1234, title: 'Some task', state: 'Active', type: 'Task' },
        ];
        const pr = makePr({ workItems });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        expect(item.children).toHaveLength(1);

        const summary = item.children![0];
        expect(summary.label).toBe('Work Items (1)');
        expect(summary.description).toBe('AB#1234');
        expect(summary.contextValue).toBe('workItemsSummary');
        expect(summary.children).toHaveLength(1);
    });

    it('creates two summary children when both checks and work items exist', () => {
        const workItems: WorkItem[] = [
            { id: 1234, title: 'Some task', state: 'Active', type: 'Task' },
        ];
        const pr = makePr({
            workItems,
            checks: [{ name: 'Build', status: 'approved', isBlocking: true }],
        });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        expect(item.children).toHaveLength(2);
        expect(item.children![0].contextValue).toBe('checksSummary');
        expect(item.children![1].contextValue).toBe('workItemsSummary');
    });

    it('creates non-expandable item when no checks and no work items', () => {
        const pr = makePr({ checks: [], workItems: [] });
        const item = PullRequestItem.fromPullRequest(pr, 'myorg');

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        expect(item.children).toBeUndefined();
    });
});

describe('PullRequestItem.fromWorkItem', () => {
    const pr = makePr();

    it('creates a tree item with work item ID and title', () => {
        const wi: WorkItem = { id: 1234, title: 'Implement feature', state: 'Active', type: 'User Story' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect(item.label).toBe('AB#1234 \u2014 Implement feature');
        expect(item.description).toBe('User Story \u00B7 Active');
        expect(item.contextValue).toBe('workItem');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    });

    it('uses bug icon for Bug type', () => {
        const wi: WorkItem = { id: 10, title: 'Fix crash', state: 'New', type: 'Bug' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect((item.iconPath as vscode.ThemeIcon).id).toBe('bug');
    });

    it('uses tasklist icon for Task type', () => {
        const wi: WorkItem = { id: 20, title: 'Do thing', state: 'Active', type: 'Task' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect((item.iconPath as vscode.ThemeIcon).id).toBe('tasklist');
    });

    it('uses bookmark icon for User Story type', () => {
        const wi: WorkItem = { id: 30, title: 'As a user...', state: 'Active', type: 'User Story' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect((item.iconPath as vscode.ThemeIcon).id).toBe('bookmark');
    });

    it('uses rocket icon for Feature type', () => {
        const wi: WorkItem = { id: 40, title: 'New Feature', state: 'Active', type: 'Feature' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect((item.iconPath as vscode.ThemeIcon).id).toBe('rocket');
    });

    it('uses star-full icon for Epic type', () => {
        const wi: WorkItem = { id: 50, title: 'Big Epic', state: 'Active', type: 'Epic' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect((item.iconPath as vscode.ThemeIcon).id).toBe('star-full');
    });

    it('uses fallback icon for unknown work item type', () => {
        const wi: WorkItem = { id: 60, title: 'Unknown type', state: 'Active', type: 'Custom Type' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect((item.iconPath as vscode.ThemeIcon).id).toBe('symbol-field');
    });

    it('sets a command to open the work item in the browser', () => {
        const wi: WorkItem = { id: 1234, title: 'Test', state: 'Active', type: 'Task' };
        const item = PullRequestItem.fromWorkItem(wi, 'myorg', pr);

        expect(item.command).toBeDefined();
        expect(item.command!.command).toBe('vscode.open');
        expect(item.command!.arguments![0].toString()).toContain('1234');
        expect(item.command!.arguments![0].toString()).toContain('dev.azure.com');
    });
});

import * as https from 'https';

export interface PullRequest {
    pullRequestId: number;
    title: string;
    sourceRefName: string;
    createdBy: { displayName: string; id: string };
    reviewers: Array<{ displayName: string; vote: number; id: string }>;
    repository: { id: string; name: string; project: { id: string; name: string } };
    status: string;
    isDraft: boolean;
    url: string;
    mergeStatus?: string;
}

export interface PolicyCheck {
    name: string;
    status: 'approved' | 'rejected' | 'running' | 'queued' | 'broken' | 'notApplicable';
    isBlocking: boolean;
}

export interface EnrichedPullRequest extends PullRequest {
    unresolvedCommentCount: number;
    checksStatus: 'passed' | 'failed' | 'running' | 'none';
    checks: PolicyCheck[];
}

export interface PrChange {
    changeType: string; // 'add' | 'edit' | 'delete' | 'rename'
    item: { path: string };
    originalPath?: string;
}

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => {
                data += chunk.toString();
            });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
    });
}

function httpsRequest(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method,
            headers: {
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...headers,
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        if (body) { req.write(JSON.stringify(body)); }
        req.end();
    });
}

export interface MyPullRequests {
    createdByMe: EnrichedPullRequest[];
    assignedToMe: EnrichedPullRequest[];
    assignedToMyTeams: EnrichedPullRequest[];
}

function authHeaders(token: string): Record<string, string> {
    return {
        'Authorization': `Basic ${Buffer.from(':' + token).toString('base64')}`,
        'Accept': 'application/json',
    };
}

export async function getUserId(org: string, token: string): Promise<string> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/connectiondata`;
    const body = await httpsGet(url, authHeaders(token));
    const data = JSON.parse(body);
    return data.authenticatedUser.id;
}

async function fetchPullRequests(
    org: string,
    token: string,
    searchParams: string
): Promise<PullRequest[]> {
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}` +
        `/_apis/git/pullrequests?${searchParams}&searchCriteria.status=active&api-version=7.1`;

    const body = await httpsGet(url, authHeaders(token));
    const response = JSON.parse(body);
    return response.value as PullRequest[];
}

async function getMyTeamIds(org: string, token: string): Promise<string[]> {
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}` +
        `/_apis/teams?$mine=true&api-version=7.1-preview.3`;
    try {
        const body = await httpsGet(url, authHeaders(token));
        const data = JSON.parse(body);
        return (data.value as Array<{ id: string }>).map((t) => t.id);
    } catch {
        return [];
    }
}

async function getUnresolvedCommentCount(
    org: string,
    project: string,
    repoId: string,
    prId: number,
    token: string
): Promise<number> {
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}` +
        `/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads?api-version=7.1`;
    try {
        const body = await httpsGet(url, authHeaders(token));
        const data = JSON.parse(body);
        const threads = data.value as Array<{
            status: string;
            isDeleted: boolean;
            comments: Array<{ commentType: string; isDeleted: boolean }>;
        }>;
        return threads.filter(
            (t) =>
                t.status === 'active' &&
                !t.isDeleted &&
                t.comments?.[0]?.commentType !== 'system' &&
                !t.comments?.every((c) => c.isDeleted)
        ).length;
    } catch {
        return 0;
    }
}

// Well-known Azure DevOps policy type IDs to include from policy evaluations.
// Only non-build governance checks are fetched here; build/CI statuses are
// fetched separately from the PR statuses API for accurate status reporting.
const INCLUDED_POLICY_TYPE_IDS = new Set([
    '40e92b44-2fe1-4dd6-b3d8-ce34c45c4d11', // Work item linking
    'c6a1889d-b943-4856-b76f-9e46bb6b0df2', // Comment requirements
]);

function normalizeGuid(id: string): string {
    return id.replace(/[{}]/g, '').toLowerCase();
}

function computeChecksStatus(checks: PolicyCheck[]): EnrichedPullRequest['checksStatus'] {
    const blocking = checks.filter((c) => c.isBlocking);
    if (blocking.length === 0) {
        return 'none';
    } else if (blocking.some((c) => c.status === 'rejected' || c.status === 'broken')) {
        return 'failed';
    } else if (blocking.some((c) => c.status === 'running' || c.status === 'queued')) {
        return 'running';
    }
    return 'passed';
}

async function getPolicyChecks(
    org: string,
    project: string,
    projectId: string,
    prId: number,
    token: string
): Promise<PolicyCheck[]> {
    const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${prId}`;
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}` +
        `/_apis/policy/evaluations?artifactId=${encodeURIComponent(artifactId)}&api-version=7.1-preview.1`;
    try {
        const body = await httpsGet(url, authHeaders(token));
        const data = JSON.parse(body);
        const evaluations = data.value as Array<{
            status: string;
            configuration: {
                isBlocking: boolean;
                isEnabled: boolean;
                isDeleted?: boolean;
                type?: { id?: string; displayName?: string };
                settings?: { displayName?: string; statusName?: string };
            };
        }>;

        const validStatuses = ['approved', 'rejected', 'running', 'queued', 'broken', 'notApplicable'];

        return evaluations
            .filter((e) =>
                e.configuration.isEnabled &&
                !e.configuration.isDeleted &&
                INCLUDED_POLICY_TYPE_IDS.has(normalizeGuid(e.configuration.type?.id ?? '')))
            .map((e) => ({
                name: e.configuration.settings?.displayName
                    || e.configuration.settings?.statusName
                    || e.configuration.type?.displayName
                    || 'Policy check',
                status: (validStatuses.includes(e.status)
                    ? e.status
                    : 'notApplicable') as PolicyCheck['status'],
                isBlocking: e.configuration.isBlocking,
            }));
    } catch {
        return [];
    }
}

async function getBuildStatuses(
    org: string,
    project: string,
    repoId: string,
    prId: number,
    token: string
): Promise<PolicyCheck[]> {
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}` +
        `/_apis/git/repositories/${encodeURIComponent(repoId)}/pullRequests/${prId}/statuses?api-version=7.1`;
    try {
        const body = await httpsGet(url, authHeaders(token));
        const data = JSON.parse(body);

        interface PrStatus {
            state: string;
            description?: string;
            context: { name: string; genre?: string };
            creationDate: string;
        }

        const statuses = data.value as PrStatus[];

        // Keep only the latest status per unique context (genre/name)
        const latestByContext = new Map<string, PrStatus>();
        for (const s of statuses) {
            const key = `${s.context.genre ?? ''}/${s.context.name}`;
            const existing = latestByContext.get(key);
            if (!existing || s.creationDate > existing.creationDate) {
                latestByContext.set(key, s);
            }
        }

        const stateMap: Record<string, PolicyCheck['status']> = {
            succeeded: 'approved',
            failed: 'rejected',
            error: 'broken',
            pending: 'running',
            notSet: 'queued',
            notApplicable: 'notApplicable',
        };

        // PR statuses are posted by build/CI pipelines that are configured
        // as required checks — treat them all as blocking since only
        // pipeline-associated policies produce PR-level statuses.
        return [...latestByContext.values()].map((s) => ({
            name: s.context.name,
            status: stateMap[s.state] ?? 'notApplicable',
            isBlocking: true,
        }));
    } catch {
        return [];
    }
}

async function enrichPullRequests(
    org: string,
    prs: PullRequest[],
    token: string
): Promise<EnrichedPullRequest[]> {
    return Promise.all(
        prs.map(async (pr) => {
            const project = pr.repository?.project?.name ?? '';
            const projectId = pr.repository?.project?.id ?? '';
            const repoId = pr.repository?.id ?? '';

            const [unresolvedCommentCount, policyChecks, buildStatuses] = await Promise.all([
                project && repoId
                    ? getUnresolvedCommentCount(org, project, repoId, pr.pullRequestId, token)
                    : Promise.resolve(0),
                project && projectId
                    ? getPolicyChecks(org, project, projectId, pr.pullRequestId, token)
                    : Promise.resolve([] as PolicyCheck[]),
                project && repoId
                    ? getBuildStatuses(org, project, repoId, pr.pullRequestId, token)
                    : Promise.resolve([] as PolicyCheck[]),
            ]);

            const checks = [...buildStatuses, ...policyChecks];

            // Add a synthetic check for merge conflicts based on the PR's
            // mergeStatus field (this isn't a policy evaluation, but it's
            // very useful to surface at a glance).
            if (pr.mergeStatus === 'conflicts') {
                checks.push({
                    name: 'Merge Conflicts',
                    status: 'rejected',
                    isBlocking: true,
                });
            }

            // Recalculate checksStatus including the synthetic check
            const checksStatus = computeChecksStatus(checks);

            return { ...pr, unresolvedCommentCount, checksStatus, checks };
        })
    );
}

export async function getMyPullRequests(
    org: string,
    token: string
): Promise<MyPullRequests> {
    const [userId, teamIds] = await Promise.all([
        getUserId(org, token),
        getMyTeamIds(org, token),
    ]);

    // Fetch all three categories in parallel
    const teamPrPromises = teamIds.map((teamId) =>
        fetchPullRequests(org, token, `searchCriteria.reviewerId=${teamId}`)
    );

    const [createdByMe, assignedToMe, ...teamPrArrays] = await Promise.all([
        fetchPullRequests(org, token, `searchCriteria.creatorId=${userId}`),
        fetchPullRequests(org, token, `searchCriteria.reviewerId=${userId}`),
        ...teamPrPromises,
    ]);

    // Deduplicate team PRs against the other two lists
    const seenIds = new Set([
        ...createdByMe.map((pr) => pr.pullRequestId),
        ...assignedToMe.map((pr) => pr.pullRequestId),
    ]);
    const teamPrsMap = new Map<number, PullRequest>();
    for (const prs of teamPrArrays) {
        for (const pr of prs) {
            if (!seenIds.has(pr.pullRequestId)) {
                teamPrsMap.set(pr.pullRequestId, pr);
            }
        }
    }
    const assignedToMyTeams = [...teamPrsMap.values()];

    // Enrich all PRs with comments and checks in parallel
    const [enrichedCreated, enrichedAssigned, enrichedTeams] = await Promise.all([
        enrichPullRequests(org, createdByMe, token),
        enrichPullRequests(org, assignedToMe, token),
        enrichPullRequests(org, assignedToMyTeams, token),
    ]);

    return {
        createdByMe: enrichedCreated,
        assignedToMe: enrichedAssigned,
        assignedToMyTeams: enrichedTeams,
    };
}

// --- PR mutation APIs (Phase 1) ---

export async function updateReviewerVote(
    org: string, project: string, repoId: string, prId: number,
    reviewerId: string, vote: number, token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/reviewers/${reviewerId}?api-version=7.1`;
    await httpsRequest(url, 'PUT', authHeaders(token), { vote });
}

export async function completePullRequest(
    org: string, project: string, repoId: string, prId: number,
    lastMergeSourceCommit: string, token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}?api-version=7.1`;
    await httpsRequest(url, 'PATCH', authHeaders(token), {
        status: 'completed',
        lastMergeSourceCommit: { commitId: lastMergeSourceCommit },
    });
}

export async function abandonPullRequest(
    org: string, project: string, repoId: string, prId: number, token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}?api-version=7.1`;
    await httpsRequest(url, 'PATCH', authHeaders(token), { status: 'abandoned' });
}

export async function addPullRequestComment(
    org: string, project: string, repoId: string, prId: number,
    content: string, token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads?api-version=7.1`;
    await httpsRequest(url, 'POST', authHeaders(token), {
        comments: [{ parentCommentId: 0, content, commentType: 1 }],
        status: 1,
    });
}

export interface ThreadPosition {
    line: number;
    offset: number;
}

export interface ThreadContext {
    filePath: string;
    rightFileStart?: ThreadPosition;
    rightFileEnd?: ThreadPosition;
    leftFileStart?: ThreadPosition;
    leftFileEnd?: ThreadPosition;
}

export async function addPullRequestFileComment(
    org: string, project: string, repoId: string, prId: number,
    content: string, threadContext: ThreadContext, token: string
): Promise<{ id: number; comments: Array<{ id: number }> }> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads?api-version=7.1`;
    const response = await httpsRequest(url, 'POST', authHeaders(token), {
        comments: [{ parentCommentId: 0, content, commentType: 1 }],
        status: 1,
        threadContext,
    });
    return JSON.parse(response);
}

export interface PrThread {
    id: number;
    status: string;
    threadContext?: ThreadContext;
    isDeleted: boolean;
    comments: Array<{
        id: number;
        parentCommentId: number;
        content: string;
        author: { displayName: string; id: string };
        publishedDate: string;
        commentType: string;
        isDeleted: boolean;
    }>;
}

export async function getPrThreads(
    org: string, project: string, repoId: string, prId: number, token: string
): Promise<PrThread[]> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads?api-version=7.1`;
    const body = await httpsGet(url, authHeaders(token));
    const data = JSON.parse(body);
    return data.value as PrThread[];
}

export async function replyToThread(
    org: string, project: string, repoId: string, prId: number,
    threadId: number, content: string, token: string
): Promise<{ id: number }> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads/${threadId}/comments?api-version=7.1`;
    const response = await httpsRequest(url, 'POST', authHeaders(token), {
        parentCommentId: 0,
        content,
        commentType: 1,
    });
    return JSON.parse(response);
}

export async function getPullRequestDetails(
    org: string, project: string, repoId: string, prId: number, token: string
): Promise<any> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}?api-version=7.1`;
    const body = await httpsGet(url, authHeaders(token));
    return JSON.parse(body);
}

export interface CreatePullRequestOptions {
    org: string;
    project: string;
    repoId: string;
    sourceRefName: string;
    targetRefName: string;
    title: string;
    description?: string;
    workItemIds?: number[];
    isDraft?: boolean;
    token: string;
}

export async function createPullRequestApi(options: CreatePullRequestOptions): Promise<{ pullRequestId: number }> {
    const { org, project, repoId, token, workItemIds, ...rest } = options;
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests?api-version=7.1`;

    const body: Record<string, unknown> = {
        sourceRefName: rest.sourceRefName,
        targetRefName: rest.targetRefName,
        title: rest.title,
        description: rest.description ?? '',
        isDraft: rest.isDraft ?? false,
    };

    if (workItemIds && workItemIds.length > 0) {
        body.workItemRefs = workItemIds.map(id => ({ id: String(id) }));
    }

    const response = await httpsRequest(url, 'POST', authHeaders(token), body);
    return JSON.parse(response);
}

export interface AutoCompleteOptions {
    mergeStrategy: 'noFastForward' | 'squash' | 'rebase' | 'rebaseMerge';
    deleteSourceBranch: boolean;
    completeWorkItems: boolean;
}

export async function setAutoComplete(
    org: string, project: string, repoId: string, prId: number,
    userId: string, options: AutoCompleteOptions, token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}?api-version=7.1`;
    await httpsRequest(url, 'PATCH', authHeaders(token), {
        autoCompleteSetBy: { id: userId },
        completionOptions: {
            mergeStrategy: options.mergeStrategy,
            deleteSourceBranch: options.deleteSourceBranch,
            transitionWorkItems: options.completeWorkItems,
        },
    });
}

export async function getRepositoryId(
    org: string, project: string, repoName: string, token: string
): Promise<string> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoName)}?api-version=7.1`;
    const body = await httpsGet(url, authHeaders(token));
    const data = JSON.parse(body);
    return data.id;
}

export async function updateWorkItemState(
    org: string, project: string, workItemId: number, state: string, token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
    await httpsRequest(url, 'PATCH', {
        ...authHeaders(token),
        'Content-Type': 'application/json-patch+json',
    }, [
        { op: 'add', path: '/fields/System.State', value: state },
    ]);
}

export interface WorkItem {
    id: number;
    title: string;
    state: string;
    type: string;
}

export async function getAssignedWorkItems(
    org: string, project: string, token: string
): Promise<WorkItem[]> {
    const wiqlUrl =
        `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}` +
        `/_apis/wit/wiql?api-version=7.1`;
    const wiqlBody = {
        query:
            "SELECT [System.Id] FROM WorkItems" +
            " WHERE [System.AssignedTo] = @Me" +
            " AND [System.State] NOT IN ('Done', 'Closed', 'Resolved', 'Removed')" +
            " ORDER BY [System.ChangedDate] DESC",
    };
    const wiqlResponse = await httpsRequest(wiqlUrl, 'POST', authHeaders(token), wiqlBody);
    const wiqlData = JSON.parse(wiqlResponse);
    const workItemIds: number[] = (wiqlData.workItems as Array<{ id: number }>).map((wi) => wi.id);

    if (workItemIds.length === 0) {
        return [];
    }

    // Fetch details in batches of 200 (API limit)
    const batchSize = 200;
    const allWorkItems: WorkItem[] = [];
    for (let i = 0; i < workItemIds.length; i += batchSize) {
        const batch = workItemIds.slice(i, i + batchSize);
        const batchUrl =
            `https://dev.azure.com/${encodeURIComponent(org)}/_apis/wit/workitems` +
            `?ids=${batch.join(',')}&fields=System.Id,System.Title,System.State,System.WorkItemType&api-version=7.1`;
        const batchResponse = await httpsGet(batchUrl, authHeaders(token));
        const batchData = JSON.parse(batchResponse);
        for (const item of batchData.value as Array<{ id: number; fields: Record<string, string> }>) {
            allWorkItems.push({
                id: item.id,
                title: item.fields['System.Title'] ?? '',
                state: item.fields['System.State'] ?? '',
                type: item.fields['System.WorkItemType'] ?? '',
            });
        }
    }

    return allWorkItems;
}

// --- PR diff APIs (Phase 2) ---

export async function getPrIterations(
    org: string, project: string, repoId: string, prId: number, token: string
): Promise<Array<{ id: number; sourceRefCommit: { commitId: string }; targetRefCommit: { commitId: string } }>> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/iterations?api-version=7.1`;
    const body = await httpsGet(url, authHeaders(token));
    const data = JSON.parse(body);
    return data.value;
}

export async function getPrChanges(
    org: string, project: string, repoId: string, prId: number, iterationId: number, token: string
): Promise<PrChange[]> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/iterations/${iterationId}/changes?api-version=7.1`;
    const body = await httpsGet(url, authHeaders(token));
    const data = JSON.parse(body);
    return (data.changeEntries ?? []) as PrChange[];
}

export async function getFileContent(
    org: string, project: string, repoId: string, path: string, commitId: string, token: string
): Promise<string> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit&$format=text&api-version=7.1`;
    return await httpsGet(url, authHeaders(token));
}

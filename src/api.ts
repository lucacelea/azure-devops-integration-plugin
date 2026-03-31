import * as https from 'https';

export interface PullRequest {
    pullRequestId: number;
    title: string;
    description?: string;
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
    commentThreads: PrThreadSummary[];
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

export interface PrThreadSummary {
    threadId: number;
    status: string;
    filePath?: string;
    line?: number;
    latestCommentId: number;
    latestCommentAuthorId?: string;
}

async function getCommentThreadSummary(
    org: string,
    project: string,
    repoId: string,
    prId: number,
    token: string
): Promise<{ unresolvedCommentCount: number; commentThreads: PrThreadSummary[] }> {
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}` +
        `/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads?api-version=7.1`;
    try {
        const body = await httpsGet(url, authHeaders(token));
        const data = JSON.parse(body);
        const threads = data.value as Array<{
            id: number;
            status: string;
            isDeleted: boolean;
            threadContext?: {
                filePath?: string;
                rightFileStart?: { line: number };
                leftFileStart?: { line: number };
            };
            comments: Array<{ id: number; commentType: string; isDeleted: boolean; author?: { id: string } }>;
        }>;
        const visibleThreads = threads
            .filter((t) => !t.isDeleted)
            .reduce<PrThreadSummary[]>((summaries, thread) => {
                const visibleComments = thread.comments.filter(
                    (comment) => !comment.isDeleted && comment.commentType !== 'system'
                );
                if (visibleComments.length === 0) {
                    return summaries;
                }

                const position = thread.threadContext?.rightFileStart ?? thread.threadContext?.leftFileStart;
                const lastComment = visibleComments[visibleComments.length - 1];
                summaries.push({
                    threadId: thread.id,
                    status: thread.status,
                    filePath: thread.threadContext?.filePath,
                    line: position?.line,
                    latestCommentId: lastComment.id,
                    latestCommentAuthorId: lastComment.author?.id,
                });
                return summaries;
            }, []);

        const unresolvedCommentCount = visibleThreads.filter((thread) => thread.status === 'active').length;
        return { unresolvedCommentCount, commentThreads: visibleThreads };
    } catch {
        return { unresolvedCommentCount: 0, commentThreads: [] };
    }
}

// Well-known Azure DevOps policy type IDs that should not appear as
// checks in the tree.
const EXCLUDED_POLICY_TYPE_IDS = new Set([
    'fa4e907d-c16b-4a4c-9dfa-4916e5d171ab', // Minimum number of reviewers
]);

// Required Reviewers policy type ID — used to resolve reviewer names
const REQUIRED_REVIEWERS_TYPE_ID = 'fd2167ab-b0be-447a-8571-0615d2f67893';

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

async function resolveIdentityNames(
    org: string,
    identityIds: string[],
    token: string
): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();
    if (identityIds.length === 0) { return nameMap; }

    const normalizedIds = identityIds.map(normalizeGuid);
    const unresolvedIds = () => normalizedIds.filter((id) => !nameMap.has(id));

    // Strategy 1: VSSPS Identities API batch lookup.
    // GUIDs only contain hex chars and hyphens — no URL encoding needed.
    // Encoding the comma separator (%2C) breaks the Azure DevOps API.
    try {
        const idsParam = normalizedIds.join(',');
        const url =
            `https://vssps.dev.azure.com/${encodeURIComponent(org)}` +
            `/_apis/identities?identityIds=${idsParam}&queryMembership=None&api-version=7.1-preview.1`;
        const body = await httpsGet(url, authHeaders(token));
        const data = JSON.parse(body);
        for (const identity of data.value ?? []) {
            const displayName = identity.providerDisplayName
                || identity.customDisplayName
                || identity.displayName;
            const id = identity.id;
            if (id && displayName) {
                nameMap.set(normalizeGuid(id), displayName);
            }
        }
    } catch {
        // Batch lookup failed — continue to next strategy
    }

    // Strategy 2: Individual VSSPS Identities lookups for any IDs the
    // batch did not resolve (including when it returned HTTP 200 but with
    // no matching identities).
    for (const id of unresolvedIds()) {
        try {
            const url =
                `https://vssps.dev.azure.com/${encodeURIComponent(org)}` +
                `/_apis/identities?identityIds=${id}&queryMembership=None&api-version=7.1-preview.1`;
            const body = await httpsGet(url, authHeaders(token));
            const data = JSON.parse(body);
            const identity = data.value?.[0];
            if (identity) {
                const displayName = identity.providerDisplayName
                    || identity.customDisplayName
                    || identity.displayName;
                if (displayName) {
                    nameMap.set(id, displayName);
                }
            }
        } catch {
            // Individual lookup failed — skip this ID
        }
    }

    // Strategy 3: Graph descriptor → subject lookup.  The
    // requiredReviewerIds may be "storage keys" that the Identities API
    // does not recognize.  The Graph Descriptors API can convert a storage
    // key into a subject descriptor, and the Subject Lookup API can then
    // return the display name.
    const remaining = unresolvedIds();
    if (remaining.length > 0) {
        const idToDescriptor = new Map<string, string>();
        for (const id of remaining) {
            try {
                const url =
                    `https://vssps.dev.azure.com/${encodeURIComponent(org)}` +
                    `/_apis/graph/descriptors/${id}?api-version=7.1-preview.1`;
                const body = await httpsGet(url, authHeaders(token));
                const data = JSON.parse(body);
                if (data.value) {
                    idToDescriptor.set(id, data.value);
                }
            } catch {
                // Descriptor lookup failed — skip
            }
        }

        if (idToDescriptor.size > 0) {
            const descriptorToId = new Map<string, string>();
            for (const [id, desc] of idToDescriptor) {
                descriptorToId.set(desc, id);
            }
            try {
                const url =
                    `https://vssps.dev.azure.com/${encodeURIComponent(org)}` +
                    `/_apis/graph/subjectlookup?api-version=7.1-preview.1`;
                const body = await httpsRequest(url, 'POST', {
                    ...authHeaders(token),
                    'Content-Type': 'application/json',
                }, {
                    lookupKeys: [...idToDescriptor.values()].map((d) => ({ descriptor: d })),
                });
                const data = JSON.parse(body);
                for (const [descriptor, subject] of Object.entries(data.value ?? {})) {
                    const s = subject as { displayName?: string };
                    const originalId = descriptorToId.get(descriptor);
                    if (s.displayName && originalId) {
                        nameMap.set(originalId, s.displayName);
                    }
                }
            } catch {
                // Subject lookup failed — skip
            }
        }
    }

    return nameMap;
}

async function getChecks(
    org: string,
    project: string,
    projectId: string,
    prId: number,
    token: string,
    reviewers: Array<{ displayName: string; id: string }>
): Promise<{ checksStatus: EnrichedPullRequest['checksStatus']; checks: PolicyCheck[] }> {
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
                settings?: { displayName?: string; statusName?: string; requiredReviewerIds?: string[] };
            };
            context?: {
                isExpired?: boolean;
                buildId?: number;
            };
        }>;

        const validStatuses = ['approved', 'rejected', 'running', 'queued', 'broken', 'notApplicable'];

        // Build a name map from PR reviewers (primary source — zero extra
        // API calls, and Azure DevOps auto-adds required reviewers to PRs).
        const reviewerNamesById = new Map<string, string>();
        for (const r of reviewers) {
            if (r.id && r.displayName) {
                reviewerNamesById.set(normalizeGuid(r.id), r.displayName);
            }
        }

        // Collect any requiredReviewerIds that weren't resolved from the
        // PR's reviewers list, then try the Identities API as a fallback.
        const unresolvedIds: string[] = [];
        for (const e of evaluations) {
            const typeId = normalizeGuid(e.configuration.type?.id ?? '');
            if (typeId === REQUIRED_REVIEWERS_TYPE_ID) {
                for (const id of e.configuration.settings?.requiredReviewerIds ?? []) {
                    if (!reviewerNamesById.has(normalizeGuid(id))) {
                        unresolvedIds.push(id);
                    }
                }
            }
        }
        if (unresolvedIds.length > 0) {
            const identityNames = await resolveIdentityNames(org, unresolvedIds, token);
            for (const [id, name] of identityNames) {
                reviewerNamesById.set(id, name);
            }
        }

        const checks: PolicyCheck[] = evaluations
            .filter((e) =>
                e.configuration.isEnabled &&
                !e.configuration.isDeleted &&
                !EXCLUDED_POLICY_TYPE_IDS.has(normalizeGuid(e.configuration.type?.id ?? '')))
            .map((e) => {
            let status: PolicyCheck['status'];
            if (validStatuses.includes(e.status)) {
                status = e.status as PolicyCheck['status'];
            } else {
                status = 'notApplicable';
            }

            // Build policies may report "running" even after the build
            // has finished when the evaluation itself is expired/stale.
            if (status === 'running' && e.context?.isExpired) {
                status = 'broken';
            }

            // For Required Reviewers policies, resolve the actual
            // reviewer/team name via the Identities API.
            let name = e.configuration.settings?.displayName
                || e.configuration.settings?.statusName
                || e.configuration.type?.displayName
                || 'Policy check';

            const typeId = normalizeGuid(e.configuration.type?.id ?? '');
            if (typeId === REQUIRED_REVIEWERS_TYPE_ID && e.configuration.settings?.requiredReviewerIds?.length) {
                const resolvedNames = e.configuration.settings.requiredReviewerIds
                    .map((id) => reviewerNamesById.get(normalizeGuid(id)))
                    .filter((n): n is string => !!n);
                if (resolvedNames.length > 0) {
                    name = resolvedNames.join(', ');
                }
            }

            return {
                name,
                status,
                isBlocking: e.configuration.isBlocking,
            };
        });

        const checksStatus = computeChecksStatus(checks);

        return { checksStatus, checks };
    } catch {
        return { checksStatus: 'none', checks: [] };
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

            const [commentSummary, checksResult] = await Promise.all([
                project && repoId
                    ? getCommentThreadSummary(org, project, repoId, pr.pullRequestId, token)
                    : Promise.resolve({ unresolvedCommentCount: 0, commentThreads: [] as PrThreadSummary[] }),
                project && projectId
                    ? getChecks(org, project, projectId, pr.pullRequestId, token, pr.reviewers ?? [])
                    : Promise.resolve({ checksStatus: 'none' as const, checks: [] as PolicyCheck[] }),
            ]);

            const checks = [...checksResult.checks];

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

            return {
                ...pr,
                unresolvedCommentCount: commentSummary.unresolvedCommentCount,
                commentThreads: commentSummary.commentThreads,
                checksStatus,
                checks,
            };
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

export async function updateThreadStatus(
    org: string, project: string, repoId: string, prId: number,
    threadId: number, status: 'active' | 'fixed', token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads/${threadId}?api-version=7.1`;
    await httpsRequest(url, 'PATCH', authHeaders(token), { status });
}

export async function getPullRequestDetails(
    org: string, project: string, repoId: string, prId: number, token: string
): Promise<PullRequestDetails> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}?api-version=7.1`;
    const body = await httpsGet(url, authHeaders(token));
    return JSON.parse(body);
}

export interface PullRequestDetails extends PullRequest {
    description?: string;
    lastMergeSourceCommit?: {
        commitId?: string;
    };
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

export async function updatePullRequestDescription(
    org: string, project: string, repoId: string, prId: number,
    description: string, token: string
): Promise<void> {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullRequests/${prId}?api-version=7.1`;
    await httpsRequest(url, 'PATCH', authHeaders(token), { description });
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

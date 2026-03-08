import * as https from 'https';

export interface PullRequest {
    pullRequestId: number;
    title: string;
    sourceBranch: string;
    createdBy: { displayName: string; id: string };
    reviewers: Array<{ displayName: string; vote: number; id: string }>;
    repository: { id: string; name: string; project: { id: string; name: string } };
    status: string;
    isDraft: boolean;
    url: string;
}

export interface EnrichedPullRequest extends PullRequest {
    unresolvedCommentCount: number;
    checksStatus: 'passed' | 'failed' | 'running' | 'none';
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

async function getUserId(org: string, token: string): Promise<string> {
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

async function getChecksStatus(
    org: string,
    project: string,
    projectId: string,
    prId: number,
    token: string
): Promise<EnrichedPullRequest['checksStatus']> {
    const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${prId}`;
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}` +
        `/_apis/policy/evaluations?artifactId=${encodeURIComponent(artifactId)}&api-version=7.1`;
    try {
        const body = await httpsGet(url, authHeaders(token));
        const data = JSON.parse(body);
        const evaluations = data.value as Array<{
            status: string;
            configuration: { isBlocking: boolean };
        }>;
        const blocking = evaluations.filter((e) => e.configuration.isBlocking);
        if (blocking.length === 0) {
            return 'none';
        }
        if (blocking.some((e) => e.status === 'rejected' || e.status === 'broken')) {
            return 'failed';
        }
        if (blocking.some((e) => e.status === 'running' || e.status === 'queued')) {
            return 'running';
        }
        return 'passed';
    } catch {
        return 'none';
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

            const [unresolvedCommentCount, checksStatus] = await Promise.all([
                project && repoId
                    ? getUnresolvedCommentCount(org, project, repoId, pr.pullRequestId, token)
                    : Promise.resolve(0),
                project && projectId
                    ? getChecksStatus(org, project, projectId, pr.pullRequestId, token)
                    : Promise.resolve('none' as const),
            ]);

            return { ...pr, unresolvedCommentCount, checksStatus };
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

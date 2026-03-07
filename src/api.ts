import * as https from 'https';

export interface PullRequest {
    pullRequestId: number;
    title: string;
    sourceBranch: string;
    createdBy: { displayName: string };
    reviewers: Array<{ displayName: string; vote: number }>;
    repository: { name: string; project: { name: string } };
    status: string;
    isDraft: boolean;
    url: string;
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

export async function getAssignedPullRequests(
    org: string,
    token: string
): Promise<PullRequest[]> {
    const url =
        `https://dev.azure.com/${encodeURIComponent(org)}` +
        `/_apis/git/pullrequests?searchCriteria.reviewerId=me&searchCriteria.status=active&api-version=7.1`;

    const auth = Buffer.from(':' + token).toString('base64');
    const headers = {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
    };

    const body = await httpsGet(url, headers);
    const response = JSON.parse(body);
    return response.value as PullRequest[];
}

import { ICommit, ICommitDetails } from "@prague/gitresources";
import { GitManager, Historian, IGitCache } from "@prague/services-client";
import Axios from "axios";
import { IAlfred } from "./interfaces";

export class Alfred implements IAlfred {
    private tenants = new Map<string, GitManager>();

    constructor(
        tenants: Array<{ id: string, key: string }>,
        private ordererUrl: string,
        historianUrl: string,
    ) {
        for (const tenant of tenants) {
            const historian = new Historian(
                `${historianUrl}/repos/${encodeURIComponent(tenant.id)}`,
                true,
                false);
            const gitManager = new GitManager(historian);
            this.tenants.set(tenant.id, gitManager);
        }
    }

    public async createFork(tenantId: string, id: string): Promise<string> {
        const forkResponse = await Axios.post<string>(
            `${this.ordererUrl}/documents/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}/forks`);

        return forkResponse.data;
    }

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string }> {
        const gitManager = this.getGitManager(tenantId);
        const versions = await gitManager.getCommits(documentId, 1);
        if (versions.length === 0) {
            return { cache: { blobs: [], commits: [], refs: { [documentId]: null }, trees: [] }, code: null };
        }

        const fullTree = await gitManager.getFullTree(versions[0].sha);

        let code: string = null;
        if (fullTree.quorumValues) {
            let quorumValues;
            for (const blob of fullTree.blobs) {
                if (blob.sha === fullTree.quorumValues) {
                    quorumValues = JSON.parse(Buffer.from(blob.content, blob.encoding).toString()) as
                        Array<[string, { value: string }]>;

                    for (const quorumValue of quorumValues) {
                        if (quorumValue[0] === "code2") {
                            code = quorumValue[1].value;
                            break;
                        }
                    }

                    break;
                }
            }
        }

        return {
            cache: {
                blobs: fullTree.blobs,
                commits: fullTree.commits,
                refs: { [documentId]: versions[0].sha },
                trees: fullTree.trees,
            },
            code,
        };
    }

    public async getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]> {
        const gitManager = this.getGitManager(tenantId);
        return gitManager.getCommits(documentId, count);
    }

    public async getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
        const gitManager = this.getGitManager(tenantId);
        return gitManager.getCommit(sha);
    }

    public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommit> {
        const versions = await this.getVersions(tenantId, documentId, 1);
        if (!versions.length) {
            return null;
        }

        const latest = versions[0];
        return {
            author: latest.commit.author,
            committer: latest.commit.committer,
            message: latest.commit.message,
            parents: latest.parents,
            sha: latest.sha,
            tree: latest.commit.tree,
            url: latest.url,
        };
    }

    private getGitManager(id: string): GitManager {
        const result = this.tenants.get(id);
        if (!result) {
            throw new Error(`Unknown tenant: ${id}`);
        }

        return result;
    }
}

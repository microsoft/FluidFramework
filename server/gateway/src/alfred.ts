/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { ICommit, ICommitDetails } from "@fluidframework/gitresources";
import { TenantManager } from "@fluidframework/server-services";
import { GitManager, Historian, IGitCache } from "@fluidframework/server-services-client";
import { ITenantManager } from "@fluidframework/server-services-core";
import { IAlfred } from "./interfaces";

export class Alfred implements IAlfred {
    private readonly tenants = new Map<string, GitManager>();

    constructor(
        tenants: { id: string; key: string }[],
        private readonly historianUrl: string,
        private readonly riddlerUrl: string,
    ) {
        for (const tenant of tenants) {
            const historian = new Historian(
                `${this.historianUrl}/repos/${encodeURIComponent(tenant.id)}`,
                true,
                false);
            const gitManager = new GitManager(historian);
            this.tenants.set(tenant.id, gitManager);
        }
    }

    public async getFullTree(
        tenantId: string,
        documentId: string,
    ): Promise<{ cache: IGitCache; code: IFluidCodeDetails | null }> {
        const gitManager = this.getGitManager(tenantId);
        const versions = await gitManager.getCommits(documentId, 1);
        if (versions.length === 0) {
            // eslint-disable-next-line no-null/no-null, max-len
            return { cache: { blobs: [], commits: [], refs: { [documentId]: null as unknown as string }, trees: [] }, code: null };
        }

        const fullTree = await gitManager.getFullTree(versions[0].sha);

        // TODO this needs to be summary aware
        // eslint-disable-next-line no-null/no-null
        let code: IFluidCodeDetails | null = null;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (fullTree.quorumValues) {
            let quorumValues;
            for (const blob of fullTree.blobs) {
                if (blob.sha === fullTree.quorumValues) {
                    quorumValues = JSON.parse(Buffer.from(blob.content, blob.encoding).toString()) as
                        [string, { value: string }][];

                    for (const quorumValue of quorumValues) {
                        if (quorumValue[0] === "code") {
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

    public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommit | null> {
        const versions = await this.getVersions(tenantId, documentId, 1);
        if (versions.length === 0) {
            // eslint-disable-next-line no-null/no-null
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

    public getTenantManager(): ITenantManager {
        return new TenantManager(this.riddlerUrl);
    }

    private getGitManager(id: string): GitManager {
        const result = this.tenants.get(id);
        if (!result) {
            throw new Error(`Unknown tenant: ${id}`);
        }

        return result;
    }
}

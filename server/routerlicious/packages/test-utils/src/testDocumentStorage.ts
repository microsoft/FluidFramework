/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICommitDetails } from "@microsoft/fluid-gitresources";
import { IGitCache } from "@microsoft/fluid-server-services-client";
import {
    IDatabaseManager,
    IDocumentDetails,
    IDocumentStorage,
    IScribe,
    ITenantManager,
} from "@microsoft/fluid-server-services-core";

const StartingSequenceNumber = 0;

// Forked from DocumentStorage to remove to server dependencies and enable testing of other components.
export class TestDocumentStorage implements IDocumentStorage {
    constructor(
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager) {
    }

    /**
     * Retrieves database details for the given document
     */
    public async getDocument(tenantId: string, documentId: string): Promise<any> {
        const collection = await this.databaseManager.getDocumentCollection();
        return collection.findOne({ documentId, tenantId });
    }

    public async getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const getOrCreateP = this.getOrCreateObject(tenantId, documentId);

        return getOrCreateP;
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

    public async getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommits(documentId, count);
    }

    public async getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommit(sha);
    }

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache; code: string }> {
        throw new Error("Method not implemented.");
    }

    /**
     * Retrieves the forks for the given document
     */
    public async getForks(tenantId: string, documentId: string): Promise<string[]> {
        // Not implemented for testDocumentstorage
        return [];
    }

    public async createFork(tenantId: string, id: string): Promise<string> {
        // Not implemented for testDocumentstorage
        return "";
    }

    private async getOrCreateObject(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const collection = await this.databaseManager.getDocumentCollection();
        const result = await collection.findOrCreate(
            {
                documentId,
                tenantId,
            },
            {
                branchMap: undefined,
                clients: undefined,
                createTime: Date.now(),
                documentId,
                forks: [],
                logOffset: undefined,
                parent: null,
                scribe: JSON.stringify({
                    lastClientSummaryHead: undefined,
                    logOffset: -1,
                    minimumSequenceNumber: -1,
                    protocolState: undefined,
                    sequenceNumber: -1,
                } as IScribe),
                sequenceNumber: StartingSequenceNumber,
                tenantId,
            });

        return result;
    }
}

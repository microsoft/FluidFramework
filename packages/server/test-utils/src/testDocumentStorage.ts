import { ICommit, ICommitDetails } from "@prague/gitresources";
import { IGitCache } from "@prague/services-client";
import {
    IDatabaseManager,
    IDocumentDetails,
    IDocumentStorage,
    ITenantManager,
} from "@prague/services-core";

const StartingSequenceNumber = 0;

// Forked from DocumentStorage to remove to server dependencies and enable testing of other components.
export class TestDocumentStorage implements IDocumentStorage {
    constructor(
        private databaseManager: IDatabaseManager,
        private tenantManager: ITenantManager) {
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
            commitId: latest.commitId,
            committer: latest.commit.committer,
            message: latest.commit.message,
            parents: latest.parents,
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

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string }> {
        throw new Error("Method not implemented.");
    }

    /**
     * Retrieves the forks for the given document
     */
    public async getForks(tenantId: string, documentId: string): Promise<string[]> {
        // not implemented for testDocumentstorage
        return [];
    }

    public async createFork(tenantId: string, id: string): Promise<string> {
        // not implemented for testDocumentstorage
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
                sequenceNumber: StartingSequenceNumber,
                tenantId,
            });

        return result;
    }
}

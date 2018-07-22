import { ICommit, ICommitDetails } from "gitresources";
import * as moniker from "moniker";
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import * as utils from "../utils";

const StartingSequenceNumber = 0;

export class DocumentStorage implements core.IDocumentStorage {
    constructor(
        private mongoManager: utils.MongoManager,
        private documentsCollectionName: string,
        private tenantManager: core.ITenantManager,
        private producer: utils.IProducer) {
    }

    /**
     * Retrieves database details for the given document
     */
    public async getDocument(tenantId: string, documentId: string): Promise<any> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<any>(this.documentsCollectionName);

        return collection.findOne({ documentId, tenantId });
    }

    public async getOrCreateDocument(tenantId: string, documentId: string): Promise<core.IDocumentDetails> {
        const getOrCreateP = this.getOrCreateObject(tenantId, documentId);

        return getOrCreateP;
    }

    public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommitDetails> {
        const versions = await this.getVersions(tenantId, documentId, 1);

        return versions.length > 0 ? versions[0] : null;
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

    /**
     * Retrieves the forks for the given document
     */
    public async getForks(tenantId: string, documentId: string): Promise<string[]> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<any>(this.documentsCollectionName);
        const document = await collection.findOne({ documentId, tenantId });

        return document.forks || [];
    }

    public async createFork(tenantId: string, id: string): Promise<string> {
        const name = moniker.choose();
        const tenant = await this.tenantManager.getTenant(tenantId);

        // Load in the latest snapshot
        const gitManager = tenant.gitManager;
        const head = await gitManager.getRef(id);
        winston.info(JSON.stringify(head));

        let sequenceNumber: number;
        let minimumSequenceNumber: number;
        if (head === null) {
            // Set the Seq# and MSN# to StartingSequenceNumber
            minimumSequenceNumber = StartingSequenceNumber;
            sequenceNumber = StartingSequenceNumber;
        } else {
            // Create a new commit, referecing the ref head, but swap out the metadata to indicate the branch details
            const attributesContentP = gitManager.getContent(head.object.sha, ".attributes");
            const branchP = gitManager.upsertRef(name, head.object.sha);
            const [attributesContent] = await Promise.all([attributesContentP, branchP]);

            const attributesJson = Buffer.from(attributesContent.content, "base64").toString("utf-8");
            const attributes = JSON.parse(attributesJson) as api.IDocumentAttributes;
            minimumSequenceNumber = attributes.minimumSequenceNumber;
            sequenceNumber = attributes.sequenceNumber;
        }

        // Get access to Mongo to update the route tables
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<core.IDocument>(this.documentsCollectionName);

        // Insert the fork entry and update the parent to prep storage for both objects
        const insertFork = collection.insertOne(
            {
                branchMap: undefined,
                clients: undefined,
                createTime: Date.now(),
                documentId: name,
                forks: [],
                logOffset: undefined,
                parent: {
                    documentId: id,
                    minimumSequenceNumber,
                    sequenceNumber,
                    tenantId,
                },
                sequenceNumber,
                tenantId,
            });
        const updateParent = await collection.update(
            {
                documentId: id,
                tenantId,
            },
            null,
            {
                forks: { documentId: name, tenantId },
            });
        await Promise.all([insertFork, updateParent]);

        // Notify the parent branch of the fork and the desire to integrate changes
        await this.sendIntegrateStream(
            tenantId,
            id,
            sequenceNumber,
            minimumSequenceNumber,
            name,
            this.producer);

        return name;
    }

    private async getOrCreateObject(tenantId: string, documentId: string): Promise<core.IDocumentDetails> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<core.IDocument>(this.documentsCollectionName);
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

    /**
     * Sends a stream integration message which will forward messages after sequenceNumber from id to name.
     */
    private async sendIntegrateStream(
        tenantId: string,
        id: string,
        sequenceNumber: number,
        minSequenceNumber: number,
        name: string,
        producer: utils.IProducer): Promise<void> {

        const contents: core.IForkOperation = {
            documentId: name,
            minSequenceNumber,
            sequenceNumber,
            tenantId,
        };

        const integrateMessage: core.IRawOperationMessage = {
            clientId: null,
            documentId: id,
            operation: {
                clientSequenceNumber: -1,
                contents,
                referenceSequenceNumber: -1,
                traces: [],
                type: api.Fork,
            },
            tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: null,
        };

        await producer.send(JSON.stringify(integrateMessage), id);
    }
}

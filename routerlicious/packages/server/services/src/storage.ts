import { IDocumentAttributes, IDocumentSystemMessage, MessageType } from "@prague/container-definitions";
import { IBlob, ICommit, ICommitDetails, ITree } from "@prague/gitresources";
import { IGitCache } from "@prague/services-client";
import {
    ICollection,
    IForkOperation,
    IProducer,
    IRawOperationMessage,
    RawOperationType,
} from "@prague/services-core";
import { IDatabaseManager, IDocumentDetails, IDocumentStorage, ITenantManager } from "@prague/services-core";
import * as moniker from "moniker";

const StartingSequenceNumber = 0;

export class DocumentStorage implements IDocumentStorage {
    constructor(
        private databaseManager: IDatabaseManager,
        private tenantManager: ITenantManager,
        private producer: IProducer) {
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

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string }> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const versions = await tenant.gitManager.getCommits(documentId, 1);
        if (versions.length === 0) {
            return { cache: { blobs: [], commits: [], refs: { [documentId]: null }, trees: [] }, code: null };
        }

        const commit = {
            author: versions[0].commit.author,
            committer: versions[0].commit.committer,
            message: versions[0].commit.message,
            parents: versions[0].parents,
            sha: versions[0].sha,
            tree: versions[0].commit.tree,
            url: versions[0].url,
        };
        const gitManager = tenant.gitManager;

        const blobs = new Map<string, IBlob>();
        const trees = new Map<string, ITree>();
        const commits = new Map<string, ICommit>();

        const baseTree = await gitManager.getTree(commit.tree.sha, true);

        commits.set(commit.sha, commit);
        trees.set(baseTree.sha, baseTree);

        const submoduleCommits = new Array<string>();
        let quorumValuesSha = null as string;
        baseTree.tree.forEach((entry) => {
            if (entry.path === "quorumValues") {
                quorumValuesSha = entry.sha;
            }

            if (entry.type === "commit") {
                submoduleCommits.push(entry.sha);
            }
        });

        const submodulesP = Promise.all(submoduleCommits.map(async (submoduleCommitSha) => {
            const submoduleCommit = await gitManager.getCommit(submoduleCommitSha);
            const submoduleTree = await gitManager.getTree(submoduleCommit.tree.sha, true);
            trees.set(submoduleCommit.tree.sha, submoduleTree);
            commits.set(submoduleCommit.sha, submoduleCommit);
        }));

        const quorumValuesP = gitManager.getBlob(quorumValuesSha).then((blob) => {
            blobs.set(blob.sha, blob);
            const quorumValues = JSON.parse(Buffer.from(blob.content, blob.encoding).toString()) as
                Array<[string, { value: string }]>;

            for (const quorumValue of quorumValues) {
                if (quorumValue[0] === "code2") {
                    return quorumValue[1].value;
                }
            }

            return null;
        });

        const [, code] = await Promise.all([submodulesP, quorumValuesP]);

        const cache = {
            blobs: Array.from(blobs.values()),
            commits: Array.from(commits.values()),
            refs: { [documentId]: commit.sha},
            trees: Array.from(trees.values()),
        };

        return { cache, code };
    }

    /**
     * Retrieves the forks for the given document
     */
    public async getForks(tenantId: string, documentId: string): Promise<string[]> {
        const collection: ICollection<any> = await this.databaseManager.getDocumentCollection();
        const document = await collection.findOne({ documentId, tenantId });

        return document.forks || [];
    }

    public async createFork(tenantId: string, id: string): Promise<string> {
        const name = moniker.choose();
        const tenant = await this.tenantManager.getTenant(tenantId);

        // Load in the latest snapshot
        const gitManager = tenant.gitManager;
        const head = await gitManager.getRef(id);

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
            const attributes = JSON.parse(attributesJson) as IDocumentAttributes;
            minimumSequenceNumber = attributes.minimumSequenceNumber;
            sequenceNumber = attributes.sequenceNumber;
        }

        // Access to the documents collection to update the route tables
        const collection = await this.databaseManager.getDocumentCollection();

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

    /**
     * Sends a stream integration message which will forward messages after sequenceNumber from id to name.
     */
    private async sendIntegrateStream(
        tenantId: string,
        id: string,
        sequenceNumber: number,
        minSequenceNumber: number,
        name: string,
        producer: IProducer): Promise<void> {

        const contents: IForkOperation = {
            documentId: name,
            minSequenceNumber,
            sequenceNumber,
            tenantId,
        };

        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(contents),
            metadata: {
                content: contents,
                split: false,
            },
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.Fork,
        };

        const integrateMessage: IRawOperationMessage = {
            clientId: null,
            documentId: id,
            operation,
            tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };

        await producer.send(integrateMessage, tenantId, id);
    }
}

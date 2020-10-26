/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-use-before-define */
import { ICommit, ICommitDetails, ICreateCommitParams, ICreateTreeEntry } from "@fluidframework/gitresources";
import {
    IDocumentAttributes,
    IDocumentSystemMessage,
    MessageType,
    ITreeEntry,
    ICommittedProposal,
    ISequencedDocumentMessage,
    ISummaryTree,
    SummaryType,
    SummaryObject,
    ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import { IGitCache, IGitManager } from "@fluidframework/server-services-client";
import {
    ICollection,
    IDeliState,
    IDatabaseManager,
    IDocumentDetails,
    IDocumentStorage,
    IForkOperation,
    IProducer,
    IRawOperationMessage,
    IScribe,
    ITenantManager,
    RawOperationType,
    SequencedOperationType,
    ISequencedOperationMessage,
    IDocument,
} from "@fluidframework/server-services-core";
import {
    getQuorumTreeEntries,
    IQuorumSnapshot,
    getGitType,
    getGitMode,
    mergeAppAndProtocolTree,
} from "@fluidframework/protocol-base";
import * as moniker from "moniker";
import * as winston from "winston";
import { fromBase64ToUtf8, gitHashFile, IsoBuffer, toUtf8, Uint8ArrayToString } from "@fluidframework/common-utils";

const StartingSequenceNumber = 0;

export class DocumentStorage implements IDocumentStorage {
    constructor(
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager,
        private readonly producer: IProducer) {
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

    public async createDocument(
        tenantId: string,
        documentId: string,
        summary: ISummaryTree,
        sequenceNumber: number,
        term: number,
        values: [string, ICommittedProposal][],
    ): Promise<IDocumentDetails> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        const blobsShaCache = new Set<string>();
        const handle = await writeSummaryTree(gitManager, summary, blobsShaCache, undefined);

        // At this point the summary op and its data are all valid and we can perform the write to history
        const quorumSnapshot: IQuorumSnapshot = {
            members: [],
            proposals: [],
            values,
        };
        const entries: ITreeEntry[] =
            getQuorumTreeEntries(documentId, sequenceNumber, sequenceNumber, term, quorumSnapshot);

        const [protocolTree, appSummaryTree] = await Promise.all([
            gitManager.createTree({ entries, id: null }),
            gitManager.getTree(handle, false),
        ]);

        const messageMetaData = { documentId, tenantId };
        winston.info(`protocolTree ${JSON.stringify(protocolTree)}`, { messageMetaData });
        winston.info(`appSummaryTree ${JSON.stringify(appSummaryTree)}`, { messageMetaData });

        // Combine the app summary with .protocol
        const newTreeEntries = mergeAppAndProtocolTree(appSummaryTree, protocolTree);

        const gitTree = await gitManager.createGitTree({ tree: newTreeEntries });
        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "dummy@microsoft.com",
                name: "Routerlicious Service",
            },
            message: "New document",
            parents: [],
            tree: gitTree.sha,
        };

        const commit = await gitManager.createCommit(commitParams);
        await gitManager.createRef(documentId, commit.sha);

        winston.info(`commit sha: ${JSON.stringify(commit.sha)}`, { messageMetaData });

        const deli: IDeliState = {
            branchMap: undefined,
            clients: undefined,
            durableSequenceNumber: sequenceNumber,
            logOffset: -1,
            sequenceNumber,
            epoch: undefined,
            term: 1,
        };

        const scribe: IScribe = {
            logOffset: -1,
            minimumSequenceNumber: sequenceNumber,
            protocolState: {
                members: [],
                minimumSequenceNumber: sequenceNumber,
                proposals: [],
                sequenceNumber,
                values,
            },
            sequenceNumber,
            lastClientSummaryHead: undefined,
        };

        const collection = await this.databaseManager.getDocumentCollection();
        const result = await collection.findOrCreate(
            {
                documentId,
                tenantId,
            },
            {
                createTime: Date.now(),
                deli: JSON.stringify(deli),
                documentId,
                forks: [],
                parent: null,
                scribe: JSON.stringify(scribe),
                tenantId,
                version: "0.1",
            });

        return result;
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

        const fullTree = await tenant.gitManager.getFullTree(versions[0].sha);

        let code: string = null;
        if (fullTree.quorumValues) {
            let quorumValues;
            for (const blob of fullTree.blobs) {
                if (blob.sha === fullTree.quorumValues) {
                    quorumValues = JSON.parse(toUtf8(blob.content, blob.encoding)) as
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
            const attributesContentP = gitManager.getContent(head.object.sha, "attributes");
            const branchP = gitManager.upsertRef(name, head.object.sha);
            const [attributesContent] = await Promise.all([attributesContentP, branchP]);

            const attributesJson = fromBase64ToUtf8(attributesContent.content);
            const attributes = JSON.parse(attributesJson) as IDocumentAttributes;
            minimumSequenceNumber = attributes.minimumSequenceNumber;
            sequenceNumber = attributes.sequenceNumber;
        }

        // Access to the documents collection to update the route tables
        const collection = await this.databaseManager.getDocumentCollection();

        // Insert the fork entry and update the parent to prep storage for both objects
        const insertFork = collection.insertOne(
            {
                createTime: Date.now(),
                deli: undefined,
                documentId: name,
                forks: [],
                parent: {
                    documentId: id,
                    minimumSequenceNumber,
                    sequenceNumber,
                    tenantId,
                },
                scribe: undefined,
                tenantId,
                version: "0.1",
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

    private async createObject(
        collection: ICollection<IDocument>,
        tenantId: string,
        documentId: string,
        deli?: string,
        scribe?: string): Promise<IDocument> {
        const value: IDocument = {
            createTime: Date.now(),
            deli,
            documentId,
            forks: [],
            parent: null,
            scribe,
            tenantId,
            version: "0.1",
        };
        await collection.insertOne(value);
        return value;
    }

    // Looks up the DB and summary for the document.
    private async getOrCreateObject(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const collection = await this.databaseManager.getDocumentCollection();
        const document = await collection.findOne({ documentId, tenantId });
        if (document === null) {
            // Guard against storage failure. Returns false if storage is unresponsive.
            const foundInSummaryP = this.readFromSummary(tenantId, documentId).then((result) => {
                return result;
            }, (err) => {
                winston.error(`Error while fetching summary for ${tenantId}/${documentId}`);
                winston.error(err);
                return false;
            });

            const inSummary = await foundInSummaryP;

            // Setting an empty string to deli and scribe denotes that the checkpoints should be loaded from summary.
            const value = inSummary ?
                await this.createObject(collection, tenantId, documentId, "", "") :
                await this.createObject(collection, tenantId, documentId);

            return {
                value,
                existing: inSummary,
            };
        } else {
            return {
                value: document,
                existing: true,
            };
        }
    }

    private async readFromSummary(tenantId: string, documentId: string): Promise<boolean> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (existingRef) {
            // Fetch ops from logTail and insert into deltas collection.
            // TODO: Make the rest endpoint handle this case.
            const opsContent = await gitManager.getContent(existingRef.object.sha, ".logTail/logTail");
            const ops = JSON.parse(
                Buffer.from(opsContent.content, opsContent.encoding).toString()) as ISequencedDocumentMessage[];
            const dbOps: ISequencedOperationMessage[] = ops.map((op: ISequencedDocumentMessage) => {
                return {
                    documentId,
                    operation: op,
                    tenantId,
                    type: SequencedOperationType,
                };
            });
            const opsCollection = await this.databaseManager.getDeltaCollection(tenantId, documentId);
            await opsCollection
                .insertMany(dbOps, false)
                // eslint-disable-next-line @typescript-eslint/promise-function-async
                .catch((error) => {
                    // Duplicate key errors are ignored
                    if (error.code !== 11000) {
                        // Needs to be a full rejection here
                        return Promise.reject(error);
                    }
                });
            winston.info(`Inserted ${dbOps.length} ops into deltas DB`);
            return true;
        } else {
            return false;
        }
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

        await producer.send([integrateMessage], tenantId, id);
    }
}

/**
 * Writes the summary tree to storage.
 * @param manager - Git manager to write.
 * @param summaryTree - summary tree to be written to storage.
 * @param blobsShaCache - cache so that duplicate blobs are written only once.
 * @param snapshot - snapshot tree.
 */
export async function writeSummaryTree(
    manager: IGitManager,
    summaryTree: ISummaryTree,
    blobsShaCache: Set<string>,
    snapshot: ISnapshotTree | undefined,
): Promise<string> {
    const entries = await Promise.all(Object.keys(summaryTree.tree).map(async (key) => {
        const entry = summaryTree.tree[key];
        const pathHandle = await writeSummaryTreeObject(manager, blobsShaCache, key, entry, snapshot);
        const treeEntry: ICreateTreeEntry = {
            mode: getGitMode(entry),
            path: encodeURIComponent(key),
            sha: pathHandle,
            type: getGitType(entry),
        };
        return treeEntry;
    }));

    const treeHandle = await manager.createGitTree({ tree: entries });
    return treeHandle.sha;
}

async function writeSummaryTreeObject(
    manager: IGitManager,
    blobsShaCache: Set<string>,
    key: string,
    object: SummaryObject,
    snapshot: ISnapshotTree | undefined,
    currentPath = "",
): Promise<string> {
    switch (object.type) {
        case SummaryType.Blob: {
            return writeSummaryBlob(object.content, blobsShaCache, manager);
        }
        case SummaryType.Handle: {
            if (snapshot === undefined) {
                throw Error("Parent summary does not exist to reference by handle.");
            }
            return getIdFromPath(object.handleType, object.handle, snapshot);
        }
        case SummaryType.Tree: {
            return writeSummaryTree(manager, object, blobsShaCache, snapshot?.trees[key]);
        }

        default:
            throw Error(`Unexpected summary object type: "${object.type}".`);
    }
}

function getIdFromPath(
    handleType: SummaryType,
    handlePath: string,
    fullSnapshot: ISnapshotTree,
): string {
    const path = handlePath.split("/").map((part) => decodeURIComponent(part));
    if (path[0] === "") {
        // root of tree should be unnamed
        path.shift();
    }

    return getIdFromPathCore(handleType, path, fullSnapshot);
}

function getIdFromPathCore(
    handleType: SummaryType,
    path: string[],
    snapshot: ISnapshotTree,
): string {
    const key = path[0];
    if (path.length === 1) {
        switch (handleType) {
            case SummaryType.Blob: {
                const tryId = snapshot.blobs[key];
                if (!tryId) {
                    throw Error("Parent summary does not have blob handle for specified path.");
                }
                return tryId;
            }
            case SummaryType.Tree: {
                const tryId = snapshot.trees[key]?.id;
                if (!tryId) {
                    throw Error("Parent summary does not have tree handle for specified path.");
                }
                return tryId;
            }
            default:
                throw Error(`Unexpected handle summary object type: "${handleType}".`);
        }
    }
    return getIdFromPathCore(handleType, path.slice(1), snapshot);
}

async function writeSummaryBlob(
    content: string | Uint8Array,
    blobsShaCache: Set<string>,
    manager: IGitManager,
): Promise<string> {
    const { parsedContent, encoding } = typeof content === "string"
        ? { parsedContent: content, encoding: "utf-8" }
        : { parsedContent: Uint8ArrayToString(content, "base64"), encoding: "base64" };

    // The gitHashFile would return the same hash as returned by the server as blob.sha
    const hash = await gitHashFile(IsoBuffer.from(parsedContent, encoding));
    if (!blobsShaCache.has(hash)) {
        const blob = await manager.createBlob(parsedContent, encoding);
        blobsShaCache.add(blob.sha);
    }
    return hash;
}

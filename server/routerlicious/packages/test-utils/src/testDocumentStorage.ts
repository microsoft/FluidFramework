/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICommitDetails, ICreateCommitParams, ICreateTreeEntry } from "@fluidframework/gitresources";
import { IGitCache, IGitManager } from "@fluidframework/server-services-client";
import {
    IDatabaseManager,
    IDeliState,
    IDocumentDetails,
    IDocumentStorage,
    IScribe,
    ITenantManager,
} from "@fluidframework/server-services-core";
import {
    ISummaryTree,
    ICommittedProposal,
    ITreeEntry,
    SummaryType,
    ISnapshotTreeEx,
    SummaryObject,
} from "@fluidframework/protocol-definitions";
import {
    IQuorumSnapshot,
    getQuorumTreeEntries,
    mergeAppAndProtocolTree,
    getGitMode,
    getGitType,
} from "@fluidframework/protocol-base";
import { gitHashFile, IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";

// Forked from DocumentStorage to remove to server dependencies and enable testing of other data stores.
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
            gitManager.createTree({ entries }),
            gitManager.getTree(handle, false),
        ]);

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

        const deli: IDeliState = {
            clients: undefined,
            durableSequenceNumber: sequenceNumber,
            logOffset: -1,
            sequenceNumber,
            epoch: undefined,
            term: 1,
            lastSentMSN: 0,
            nackMessages: undefined,
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

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache; code: string }> {
        throw new Error("Method not implemented.");
    }

    private async getOrCreateObject(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const collection = await this.databaseManager.getDocumentCollection();
        const result = await collection.findOrCreate(
            {
                documentId,
                tenantId,
            },
            {
                createTime: Date.now(),
                deli: undefined,
                documentId,
                scribe: undefined,
                tenantId,
                version: "0.1",
            });

        return result;
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
    snapshot: ISnapshotTreeEx | undefined,
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
    snapshot: ISnapshotTreeEx | undefined,
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
    fullSnapshot: ISnapshotTreeEx,
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
    snapshot: ISnapshotTreeEx,
): string {
    const key = path[0];
    if (path.length === 1) {
        switch (handleType) {
            case SummaryType.Blob: {
                return snapshot.blobs[key];
            }
            case SummaryType.Tree: {
                return snapshot.trees[key]?.id;
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

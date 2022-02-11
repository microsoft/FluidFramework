/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IBlob,
    ICreateBlobParams,
    ICreateCommitParams,
    ICreateTreeEntry,
    ICreateTreeParams,
    IRef,
    ITree,
} from "@fluidframework/gitresources";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import { SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IWholeFlatSummary,
    IWholeFlatSummaryBlob,
    IWholeFlatSummaryTreeEntry,
    IWholeSummaryBlob,
    IWholeSummaryPayload,
    IWholeSummaryTree,
    IWholeSummaryTreeHandleEntry,
    IWholeSummaryTreeValueEntry,
    IWriteSummaryResponse,
    NetworkError,
    WholeSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { Router } from "express";
import { Provider } from "nconf";
import { IExternalStorageManager } from "../externalStorageManager";
import { RepositoryManager } from "../utils";
import { createBlob, getBlob } from "./git/blobs";
import { createCommit } from "./git/commits";
import { createRef, getRef, patchRef } from "./git/refs";
import { createTree, getTreeRecursive } from "./git/trees";
import { getCommits } from "./repository/commits";
import { handleResponse } from "./utils";

interface ISummaryVersion {
    id: string;
    treeId: string;
}

export class WholeSummaryReadGitManager {
    constructor(
        /**
         * Find the sha for latest version of a document and its corresponding summary tree sha.
         */
        private readonly getLatestVersion: () => Promise<ISummaryVersion>,
        /**
         * Read blob from storage.
         */
        private readonly readBlob: (sha: string) => Promise<IBlob>,
        /**
         * Read tree recursively from storage.
         */
        private readonly readTreeRecursive: (sha: string) => Promise<ITree>,
    ) {}

    public async readSummary(sha: string): Promise<IWholeFlatSummary> {
        let version: ISummaryVersion;
        if (sha === "latest") {
            version = await this.getLatestVersion();
        } else {
            version = { id: sha, treeId: sha };
        }
        const rawTree = await this.readTreeRecursive(version.treeId);
        const wholeFlatSummaryTreeEntries: IWholeFlatSummaryTreeEntry[] = [];
        const wholeFlatSummaryBlobPs: Promise<IWholeFlatSummaryBlob>[] = [];
        rawTree.tree.forEach((treeEntry) => {
            if (treeEntry.type === "blob") {
                wholeFlatSummaryTreeEntries.push({
                    type: "blob",
                    id: treeEntry.sha,
                    path: treeEntry.path,
                });
                wholeFlatSummaryBlobPs.push(
                    this.getBlob(
                        treeEntry.sha,
                    ),
                );
            } else {
                wholeFlatSummaryTreeEntries.push({
                    type: "tree",
                    path: treeEntry.path,
                });
            }
        });
        const wholeFlatSummaryBlobs = await Promise.all(wholeFlatSummaryBlobPs);
        return {
            id: version.id,
            trees: [
                {
                    id: rawTree.sha,
                    entries: wholeFlatSummaryTreeEntries,
                    // We don't store sequence numbers in git
                    sequenceNumber: undefined,
                },
            ],
            blobs: wholeFlatSummaryBlobs,
        };
    }

    private async getBlob(sha: string): Promise<IWholeFlatSummaryBlob> {
        const blob = await this.readBlob(
            sha,
        );
        return {
            content: blob.content,
            encoding: blob.encoding === "base64" ? "base64" : "utf-8",
            id: blob.sha,
            size: blob.size,
        };
    }
}

function getSummaryObjectFromWholeSummaryTreeEntry(entry: WholeSummaryTreeEntry): SummaryObject {
    if ((entry as IWholeSummaryTreeHandleEntry).id !== undefined) {
        return {
            type: SummaryType.Handle,
            handleType: entry.type === "tree" ? SummaryType.Tree : SummaryType.Blob,
            handle: (entry as IWholeSummaryTreeHandleEntry).id,
        };
    }
    if (entry.type === "blob") {
        return {
            type: SummaryType.Blob,
            // We don't use this in the code below. We mostly just care about summaryObject for type inference.
            content: "",
        };
    }
    if (entry.type === "tree") {
        return {
            type: SummaryType.Tree,
            // We don't use this in the code below. We mostly just care about summaryObject for type inference.
            tree: {},
            unreferenced: (entry as IWholeSummaryTreeValueEntry).unreferenced,
        };
    }
    throw new NetworkError(400, `Unknown entry type: ${entry.type}`);
}

export class WholeSummaryWriteGitManager {
    constructor(
        // TODO: maybe just convert these params into a single GitManager with a non-REST Historian client behind it
        /**
         * Find the sha for latest version of a document and its corresponding summary tree sha.
         */
        private readonly getLatestVersion: () => Promise<ISummaryVersion>,
        /**
         * Write blob to storage and return the git sha.
         */
        private readonly writeBlob: (blob: ICreateBlobParams) => Promise<string>,
        /**
         * Write tree to storage and return the git sha.
         */
        private readonly writeTree: (tree: ICreateTreeParams) => Promise<string>,
        /**
         * Read tree recursively from storage.
         */
        private readonly readTreeRecursive: (treeSha: string) => Promise<ITree>,
        /**
         * Write commit to storage and return the git sha.
         */
        private readonly writeCommit: (commit: ICreateCommitParams) => Promise<string>,
        /**
         * Write document ref to storage.
         */
        private readonly writeRef: (commitSha: string) => Promise<void>,
        /**
         * Read document ref from storage.
         * Return undefined if no ref is found.
         */
        private readonly readRef: () => Promise<IRef | undefined>,
        /**
         * Upsert document ref in storage.
         */
        private readonly upsertRef: (commitSha: string) => Promise<void>,
    ) {}

    public async writeSummary(payload: IWholeSummaryPayload): Promise<string> {
        if (payload.type === "channel") {
            return this.writeChannelSummary(payload);
        }
        if (payload.type === "container") {
            return this.writeContainerSummary(payload);
        }
        throw new NetworkError(400, `Unknown Summary Type: ${payload.type}`);
    }

    private async writeChannelSummary(payload: IWholeSummaryPayload): Promise<string> {
        return this.writeSummaryTreeCore(payload.entries);
    }

    private async writeContainerSummary(payload: IWholeSummaryPayload): Promise<string> {
        const treeHandle = await this.writeSummaryTreeCore(payload.entries);
        // TODO: is there ever a case where the parent of a container summary is not the commit referenced by the ref?
        const existingRef = await this.readRef();
        let commitParams: ICreateCommitParams
        if (!existingRef && payload.sequenceNumber === 0) {
            // Create new document
            commitParams = {
                author: {
                    date: new Date().toISOString(),
                    email: "dummy@microsoft.com",
                    name: "GitRest Service",
                },
                message: "New document",
                parents: [],
                tree: treeHandle,
            };
        } else {
            // Update existing document
            commitParams = {
                author: {
                    date: new Date().toISOString(),
                    email: "dummy@microsoft.com",
                    name: "GitRest Service",
                },
                // TODO: How to know if Service/Client Summary?
                // .app handle embedded=true looks to be an indicator. Is it worth checking?
                message: `Service/Client Summary @${payload.sequenceNumber}`,
                parents: existingRef ? [existingRef.object.sha] : [],
                tree: treeHandle,
            };
        }
        const commitSha = await this.writeCommit(commitParams);
        if (existingRef) {
            await this.upsertRef(commitSha);
        } else {
            await this.writeRef(commitSha);
        }
        return treeHandle;
    }

    private async writeSummaryTreeCore(
        wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
    ): Promise<string> {
        const pathToShaMap = await this.getPathToShaMapFromLastSummary();
        const entries: ICreateTreeEntry[] = await Promise.all(wholeSummaryTreeEntries.map(async (entry) => {
            const summaryObject = getSummaryObjectFromWholeSummaryTreeEntry(entry);
            const pathHandle = await this.writeSummaryTreeObject(entry, summaryObject, pathToShaMap);
            return {
                mode: getGitMode(summaryObject),
                path: entry.path,
                sha: pathHandle,
                type: getGitType(summaryObject),
            };
        }));

        const treeHandle = await this.writeTree(
            { tree: entries },
        );
        return treeHandle;
    }

    private async writeSummaryTreeObject(
        wholeSummaryTreeEntry: WholeSummaryTreeEntry,
        summaryObject: SummaryObject,
        pathToShaMap: Map<string, string>,
    ): Promise<string> {
        switch(summaryObject.type) {
            case SummaryType.Blob:
                return this.writeSummaryBlob(
                    ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryBlob),
                );
            case SummaryType.Tree:
                return this.writeSummaryTreeCore(
                    ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryTree).entries ?? [],
                );
            case SummaryType.Handle:
                // TODO: is there a case where the sha does not exist in the previous summary tree?
                return pathToShaMap.get((wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry).path);
            default:
                throw new NetworkError(501, "Not Implemented");
        }
    }

    private async writeSummaryBlob(blob: IWholeSummaryBlob): Promise<string> {
        const blobSha = await this.writeBlob(
            {
                content: blob.content,
                encoding: blob.encoding,
            },
        );
        return blobSha;
    }

    /**
     * Returns a map of Summary tree paths to git shas from the last document summary.
     * Used for mapping handle paths to git shas.
     */
    private async getPathToShaMapFromLastSummary(): Promise<Map<string, string>> {
        const pathToShaMap = new Map<string, string>();
        let latestVersion: ISummaryVersion;
        try {
            latestVersion = await this.getLatestVersion();
        } catch (e) {
            // Latest version call fails if no previous summary (i.e. on new documents)
            // TODO: be smarter about this rather than catching an expected failure
            return pathToShaMap;
        }
        const flatTree = await this.readTreeRecursive(latestVersion.treeId);
        for (const entry of flatTree.tree) {
            pathToShaMap.set(entry.path, entry.sha);
        }
        return pathToShaMap;
    }
}

export async function getSummary(
    repoManager: RepositoryManager,
    owner: string,
    repo: string,
    sha: string,
    documentId: string,
    externalStorageEnabled: boolean,
    externalStorageManager: IExternalStorageManager): Promise<IWholeFlatSummary> {
    const getLatestVersion = async (): Promise<ISummaryVersion> => {
        const commitDetails = await getCommits(
            repoManager,
            owner,
            repo,
            documentId,
            1,
            { config: { enabled: externalStorageEnabled } },
            externalStorageManager);
        return {
            id: commitDetails[0].sha,
            treeId: commitDetails[0].commit.tree.sha,
        };
    };
    const readBlob = async (blobSha: string): Promise<IBlob> => {
        const blob = await getBlob(
            repoManager,
            owner,
            repo,
            blobSha,
        );
        return blob;
    };
    const readTreeRecursive = async (treeSha: string): Promise<ITree> => {
        const rawTree = await getTreeRecursive(
            repoManager,
            owner,
            repo,
            treeSha);
        return rawTree;
    };
    const wholeSummaryReadGitManager = new WholeSummaryReadGitManager(
        getLatestVersion,
        readBlob,
        readTreeRecursive,
    );
    return wholeSummaryReadGitManager.readSummary(sha);
}

export async function createSummary(
    repoManager: RepositoryManager,
    owner: string,
    repo: string,
    payload: IWholeSummaryPayload,
    documentId: string,
    externalStorageEnabled: boolean,
    externalStorageManager: IExternalStorageManager): Promise<IWriteSummaryResponse> {
    const getLatestVersion = async (): Promise<ISummaryVersion> => {
        const commitDetails = await getCommits(
            repoManager,
            owner,
            repo,
            documentId,
            1,
            { config: { enabled: externalStorageEnabled } },
            externalStorageManager);
        return {
            id: commitDetails[0].sha,
            treeId: commitDetails[0].commit.tree.sha,
        };
    };
    const writeBlob = async (blobParams: ICreateBlobParams): Promise<string> => {
        const blobResponse = await createBlob(
            repoManager,
            owner,
            repo,
            blobParams,
        );
        return blobResponse.sha;
    };
    const writeTree = async (treeParams: ICreateTreeParams): Promise<string> => {
        const treeHandle = await createTree(
            repoManager,
            owner,
            repo,
            treeParams,
        );
        return treeHandle.sha;
    };
    const readTreeRecursive = async (treeSha: string): Promise<ITree> => {
        const rawTree = await getTreeRecursive(
            repoManager,
            owner,
            repo,
            treeSha);
        return rawTree;
    };
    const writeCommit = async (commitParams: ICreateCommitParams): Promise<string> => {
        const commit = await createCommit(
            repoManager,
            owner,
            repo,
            commitParams,
        );
        return commit.sha;
    };
    const readRef = async (): Promise<IRef | undefined> => {
        try {
            const ref = await getRef(
                repoManager,
                owner,
                repo,
                `refs/heads/${documentId}`,
                { config: { enabled: externalStorageEnabled } },
                externalStorageManager,
            );
            return ref;
        } catch (e) {
            return undefined;
        }
    };
    const upsertRef = async (commitSha: string): Promise<void> => {
        await patchRef(
            repoManager,
            owner,
            repo,
            `refs/heads/${documentId}`,
            {
                force: true,
                sha: commitSha,
                config: { enabled: externalStorageEnabled },
            },
            externalStorageManager,
        );
    };
    const writeRef = async (commitSha: string): Promise<void> => {
        await createRef(
            repoManager,
            owner,
            repo,
            {
                ref: `refs/heads/${documentId}`,
                sha: commitSha,
                config: { enabled: externalStorageEnabled },
            },
            externalStorageManager,
        );
    };
    const wholeSummaryWriteGitManager = new WholeSummaryWriteGitManager(
        getLatestVersion,
        writeBlob,
        writeTree,
        readTreeRecursive,
        writeCommit,
        writeRef,
        readRef,
        upsertRef,
    );
    const summaryHandle = await wholeSummaryWriteGitManager.writeSummary(payload);
    return { id: summaryHandle };
}

export async function deleteSummary(
    repoManager: RepositoryManager,
    owner: string,
    repo: string,
    softDelete: boolean): Promise<boolean> {
    throw new NetworkError(501, "Not Implemented");
}

export function create(
    store: Provider,
    repoManager: RepositoryManager,
    externalStorageManager: IExternalStorageManager,
): Router {
    const router: Router = Router();

    /**
     * Retrieves a summary.
     * If sha is "latest", returns latest summary for owner/repo.
     */
    router.get("/repos/:owner/:repo/git/summaries/:sha", (request, response) => {
        const storageRoutingId: string = request.get("Storage-Routing-Id");
        const [,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(Promise.reject(new NetworkError(400, "Invalid Storage-Routing-Id header")), response);
            return;
        }
        handleResponse(
            getSummary(
                repoManager,
                request.params.owner,
                request.params.repo,
                request.params.sha,
                documentId,
                true, /* externalStorageEnabled - hardcoded to true in services-client/GitManager */
                externalStorageManager,
            ),
            response,
        );
    });

    /**
     * Creates a new summary.
     */
    router.post("/repos/:owner/:repo/git/summaries", (request, response) => {
        const storageRoutingId: string = request.get("Storage-Routing-Id");
        const [,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(Promise.reject(new NetworkError(400, "Invalid Storage-Routing-Id header")), response);
            return;
        }
        const wholeSummaryPayload: IWholeSummaryPayload = request.body;
        handleResponse(
            createSummary(
                repoManager,
                request.params.owner,
                request.params.repo,
                wholeSummaryPayload,
                documentId,
                true, /* externalStorageEnabled - hardcoded to true in services-client/GitManager */
                externalStorageManager,
            ),
            response,
            201,
        );
    });

    /**
     * Deletes the latest summary for the owner/repo.
     * If header Soft-Delete="true", only flags summary as deleted.
     */
    router.delete("/repos/:owner/:repo/git/summaries/:sha", (request, response) => {
        const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
        handleResponse(
            deleteSummary(repoManager, request.params.owner, request.params.repo, softDelete),
            response,
        );
    });

    return router;
}

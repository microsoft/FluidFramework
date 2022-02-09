/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ICreateBlobParams, ICreateTreeEntry, ICreateTreeParams, ITree } from "@fluidframework/gitresources";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import { SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IGetRefParamsExternal,
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
import { getReadParams, RepositoryManager } from "../utils";
/* eslint-disable import/no-internal-modules */
import { createBlob, getBlob } from "./git/blobs";
import { createTree, getTreeRecursive } from "./git/trees";
import { getCommits } from "./repository/commits";
/* eslint-enable import/no-internal-modules */
import { handleResponse } from "./utils";

interface ISummaryVersion {
    id: string;
    treeId: string;
}

export class WholeSummaryReadGitManager {
    constructor(
        /**
         * Find the sha for latest version of a document's summary.
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
        /**
         * Write blob to storage and return the git sha.
         */
        private readonly writeBlob: (blob: ICreateBlobParams) => Promise<string>,
        /**
         * Write tree to storage and return the git sha.
         */
        private readonly writeTree: (tree: ICreateTreeParams) => Promise<string>,
    ) {}

    public async writeSummary(payload: IWholeSummaryPayload): Promise<string> {
        return this.writeSummaryTreeCore(payload.entries);
    }

    private async writeSummaryTreeCore(
        wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
    ): Promise<string> {
        const entries: ICreateTreeEntry[] = await Promise.all(wholeSummaryTreeEntries.map(async (entry) => {
            const summaryObject = getSummaryObjectFromWholeSummaryTreeEntry(entry);
            const pathHandle = await this.writeSummaryTreeObject(entry, summaryObject);
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
                return (wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry).id;
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
}

export async function getSummary(
    repoManager: RepositoryManager,
    owner: string,
    repo: string,
    sha: string,
    documentId: string,
    externalStorageReadParams: IGetRefParamsExternal | undefined,
    externalStorageManager: IExternalStorageManager): Promise<IWholeFlatSummary> {
    const getLatestVersion = async (): Promise<ISummaryVersion> => {
        const commitDetails = await getCommits(
            repoManager,
            owner,
            repo,
            documentId,
            1,
            externalStorageReadParams,
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
    payload: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
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
    const wholeSummaryWriteGitManager = new WholeSummaryWriteGitManager(
        writeBlob,
        writeTree,
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
                getReadParams(request.query?.config),
                externalStorageManager,
            ),
            response,
        );
    });

    /**
     * Creates a new summary.
     */
    router.post("/repos/:owner/:repo/git/summaries", (request, response) => {
        const wholeSummaryPayload: IWholeSummaryPayload = request.body;
        handleResponse(
            createSummary(repoManager, request.params.owner, request.params.repo, wholeSummaryPayload),
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

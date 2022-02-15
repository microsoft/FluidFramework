/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTreeEntry } from "@fluidframework/gitresources";
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
import {
    getExternalWriterParams,
    IExternalWriterConfig,
    IRepositoryManager,
    IRepositoryManagerFactory,
} from "../utils";
import { handleResponse } from "./utils";

async function getSummaryBlob(repoManager: IRepositoryManager, sha: string): Promise<IWholeFlatSummaryBlob> {
    const blob = await repoManager.getBlob(
        sha,
    );
    return {
        content: blob.content,
        encoding: blob.encoding === "base64" ? "base64" : "utf-8",
        id: blob.sha,
        size: blob.size,
    };
}

async function getFlatSummary(repoManager: IRepositoryManager, sha: string): Promise<IWholeFlatSummary> {
    const rawTree = await repoManager.getTree(sha, true /* recursive */);
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
                getSummaryBlob(
                    repoManager,
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
        id: rawTree.sha,
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

export async function getSummary(
    repoManager: IRepositoryManager,
    sha: string,
    documentId: string,
    externalStorageReadParams: IExternalWriterConfig | undefined,
): Promise<IWholeFlatSummary> {
    let versionId = sha;
    if (sha === "latest") {
        const versions = await repoManager.getCommits(
            documentId,
            1,
            externalStorageReadParams,
        );
        versionId = versions[0].commit.tree.sha;
    }
    return getFlatSummary(repoManager, versionId);
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

async function writeSummaryTreeCore(
    repoManager: IRepositoryManager,
    wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
): Promise<string> {
    const entries: ICreateTreeEntry[] = await Promise.all(wholeSummaryTreeEntries.map(async (entry) => {
        const summaryObject = getSummaryObjectFromWholeSummaryTreeEntry(entry);
        const pathHandle = await writeSummaryTreeObject(repoManager, entry, summaryObject);
        return {
            mode: getGitMode(summaryObject),
            path: entry.path,
            sha: pathHandle,
            type: getGitType(summaryObject),
        };
    }));

    const treeHandle = await repoManager.createTree(
        { tree: entries },
    );
    return treeHandle.sha;
}

async function writeSummaryTreeObject(
    repoManager: IRepositoryManager,
    wholeSummaryTreeEntry: WholeSummaryTreeEntry,
    summaryObject: SummaryObject,
): Promise<string> {
    switch(summaryObject.type) {
        case SummaryType.Blob:
            return writeSummaryBlob(
                repoManager,
                ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryBlob),
            );
        case SummaryType.Tree:
            return writeSummaryTreeCore(
                repoManager,
                ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryTree).entries ?? [],
            );
        case SummaryType.Handle:
            return (wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry).id;
        default:
            throw new NetworkError(501, "Not Implemented");
    }
}

async function writeSummaryBlob(repoManager: IRepositoryManager, blob: IWholeSummaryBlob): Promise<string> {
    const blobResponse = await repoManager.createBlob(
        {
            content: blob.content,
            encoding: blob.encoding,
        },
    );
    return blobResponse.sha;
}

export async function createSummary(
    repoManager: IRepositoryManager,
    payload: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
    const summaryHandle = await writeSummaryTreeCore(repoManager, payload.entries);
    return { id: summaryHandle };
}

export async function deleteSummary(
    repoManager: IRepositoryManager,
    softDelete: boolean): Promise<boolean> {
    throw new NetworkError(501, "Not Implemented");
}

export function create(
    store: Provider,
    repoManagerFactory: IRepositoryManagerFactory,
): Router {
    const router: Router = Router();

    /**
     * Retrieves a summary.
     * If sha is "latest", returns latest summary for owner/repo.
     */
    router.get("/repos/:owner/:repo/git/summaries/:sha", async (request, response) => {
        const storageRoutingId: string = request.get("Storage-Routing-Id");
        const [,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(Promise.reject(new NetworkError(400, "Invalid Storage-Routing-Id header")), response);
            return;
        }
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then((repoManager) => getSummary(
            repoManager,
            request.params.sha,
            documentId,
            getExternalWriterParams(request.query?.config as string),
        ));
        handleResponse(resultP, response);
    });

    /**
     * Creates a new summary.
     */
    router.post("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const wholeSummaryPayload: IWholeSummaryPayload = request.body;
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then((repoManager) => createSummary(repoManager, wholeSummaryPayload));
        handleResponse(resultP, response, 201);
    });

    /**
     * Deletes the latest summary for the owner/repo.
     * If header Soft-Delete="true", only flags summary as deleted.
     */
    router.delete("/repos/:owner/:repo/git/summaries/:sha", async (request, response) => {
        const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then((repoManager) => deleteSummary(repoManager, softDelete));
        handleResponse(resultP, response, 204);
    });

    return router;
}

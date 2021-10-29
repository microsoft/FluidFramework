/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTreeEntry } from "@fluidframework/gitresources";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import { SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IWholeFlatSummary,
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
import { RepositoryManager } from "../utils";
/* eslint-disable import/no-internal-modules */
import { createBlob } from "./git/blobs";
import { createTree } from "./git/trees";
/* eslint-enable import/no-internal-modules */
import { handleResponse } from "./utils";

export async function getSummary(
    repoManager: RepositoryManager,
    owner: string,
    repo: string,
    sha: string): Promise<IWholeFlatSummary> {
    throw new NetworkError(501, "Not Implemented");
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

interface IRepositoryInformation {
    repoManager: RepositoryManager;
    owner: string;
    repo: string;
}

async function writeSummaryTreeCore(
    repoInfo: IRepositoryInformation,
    wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
): Promise<string> {
    const entries: ICreateTreeEntry[] = await Promise.all(wholeSummaryTreeEntries.map(async (entry) => {
        const summaryObject = getSummaryObjectFromWholeSummaryTreeEntry(entry);
        const pathHandle = await writeSummaryTreeObject(repoInfo, entry, summaryObject);
        return {
            mode: getGitMode(summaryObject),
            path: entry.path,
            sha: pathHandle,
            type: getGitType(summaryObject),
        };
    }));

    const treeHandle = await createTree(
        repoInfo.repoManager,
        repoInfo.owner,
        repoInfo.repo,
        { tree: entries },
    );
    return treeHandle.sha;
}

async function writeSummaryTreeObject(
    repoInfo: IRepositoryInformation,
    wholeSummaryTreeEntry: WholeSummaryTreeEntry,
    summaryObject: SummaryObject,
): Promise<string> {
    switch(summaryObject.type) {
        case SummaryType.Blob:
            return writeSummaryBlob(
                repoInfo,
                ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryBlob),
            );
        case SummaryType.Tree:
            return writeSummaryTreeCore(
                repoInfo,
                ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryTree).entries ?? [],
            );
        case SummaryType.Handle:
            return (wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry).id;
        default:
            throw new NetworkError(501, "Not Implemented");
    }
}

async function writeSummaryBlob(repoInfo: IRepositoryInformation, blob: IWholeSummaryBlob): Promise<string> {
    const blobResponse = await createBlob(
        repoInfo.repoManager,
        repoInfo.owner,
        repoInfo.repo,
        {
            content: blob.content,
            encoding: blob.encoding,
        },
    );
    return blobResponse.sha;
}

export async function createSummary(
    repoManager: RepositoryManager,
    owner: string,
    repo: string,
    payload: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
    const summaryHandle = await writeSummaryTreeCore({ repoManager, owner, repo }, payload.entries);
    return { id: summaryHandle };
}

export async function deleteSummary(
    repoManager: RepositoryManager,
    owner: string,
    repo: string,
    softDelete: boolean): Promise<boolean> {
    throw new NetworkError(501, "Not Implemented");
}

export function create(store: Provider, repoManager: RepositoryManager): Router {
    const router: Router = Router();

    /**
     * Retrieves a summary.
     * If sha is "latest", returns latest summary for owner/repo.
     */
    router.get("/repos/:owner/:repo/git/summaries/:sha", (request, response) => {
        handleResponse(
            getSummary(repoManager, request.params.owner, request.params.repo, request.params.sha),
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

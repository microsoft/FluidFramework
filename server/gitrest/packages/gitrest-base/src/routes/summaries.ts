/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IWholeFlatSummary,
    IWholeSummaryPayload,
    IWriteSummaryResponse,
    NetworkError,
} from "@fluidframework/server-services-client";
import { Router } from "express";
import { Provider } from "nconf";
import winston from "winston";
import safeStringify from "json-stringify-safe";
import {
    getExternalWriterParams,
    IExternalWriterConfig,
    IRepositoryManagerFactory,
    latestSummarySha,
    GitWholeSummaryManager,
    retrieveLatestFullSummaryFromStorage,
    persistLatestFullSummaryInStorage,
    isContainerSummary,
    IRepositoryManager,
    IFileSystemManager,
    IFileSystemManagerFactory,
    Constants,
    getRepoManagerParamsFromRequest,
} from "../utils";
import { handleResponse } from "./utils";

function getDocumentStorageDirectory(repoManager: IRepositoryManager, documentId: string): string {
    return `${repoManager.path}/${documentId}`;
}

async function getSummary(
    repoManager: IRepositoryManager,
    fileSystemManager: IFileSystemManager,
    sha: string,
    documentId: string,
    tenantId: string,
    externalWriterConfig?: IExternalWriterConfig,
    persistLatestFullSummary = false,
): Promise<IWholeFlatSummary> {
    if (persistLatestFullSummary && sha === latestSummarySha) {
        try {
            const latestFullSummaryFromStorage = await retrieveLatestFullSummaryFromStorage(
                fileSystemManager,
                getDocumentStorageDirectory(repoManager, documentId),
            );
            if (latestFullSummaryFromStorage !== undefined) {
                return latestFullSummaryFromStorage;
            }
        } catch (e) {
            // This read is for optimization purposes, so on failure
            // we can try to read the summary in typical fashion.
            winston.error(`Failed to read latest full summary from storage: ${safeStringify(e)}`, {
                documentId,
                tenantId,
            });
        }
    }

    const wholeSummaryManager = new GitWholeSummaryManager(
        documentId,
        repoManager,
        externalWriterConfig?.enabled ?? false,
    );
    return wholeSummaryManager.readSummary(sha);
}

async function createSummary(
    repoManager: IRepositoryManager,
    fileSystemManager: IFileSystemManager,
    payload: IWholeSummaryPayload,
    documentId: string,
    tenantId: string,
    externalWriterConfig?: IExternalWriterConfig,
    persistLatestFullSummary = false,
): Promise<IWriteSummaryResponse | IWholeFlatSummary> {
    const wholeSummaryManager = new GitWholeSummaryManager(
        documentId,
        repoManager,
        externalWriterConfig?.enabled ?? false,
    );
    const {isNew, writeSummaryResponse} = await wholeSummaryManager.writeSummary(payload);

    // Waiting to pre-compute and persist latest summary would slow down document creation,
    // so skip this step if it is a new document.
    if (!isNew && isContainerSummary(payload)) {
        const latestFullSummary: IWholeFlatSummary | undefined = await wholeSummaryManager.readSummary(
            writeSummaryResponse.id,
        ).catch((err) => {
            // This read is for Historian caching purposes, so it should be ignored on failure.
            winston.error(`Failed to read latest summary after writing container summary: ${safeStringify(err)}`, {
                documentId,
                tenantId,
            });
            return undefined;
        });
        if (latestFullSummary) {
            if (persistLatestFullSummary) {
                try {
                    // TODO: does this fail if file is open and still being written to from a previous request?
                    await persistLatestFullSummaryInStorage(
                        fileSystemManager,
                        getDocumentStorageDirectory(repoManager, documentId),
                        latestFullSummary,
                    );
                } catch(e) {
                    winston.error(`Failed to persist latest full summary to storage: ${safeStringify(e)}`, {
                        documentId,
                        tenantId,
                    });
                    // TODO: Find and add more information about this failure so that Scribe can retry as necessary.
                    throw new NetworkError(500, "Failed to persist latest full summary to storage");
                }
            }
            return latestFullSummary;
        }
    }

    return writeSummaryResponse;
}

async function deleteSummary(
    repoManager: IRepositoryManager,
    fileSystemManager: IFileSystemManager,
    documentId: string,
    tenantId: string,
    softDelete: boolean,
    externalWriterConfig?: IExternalWriterConfig,
    persistLatestFullSummary = false): Promise<boolean> {
    throw new NetworkError(501, "Not Implemented");
}

export function create(
    store: Provider,
    fileSystemManagerFactory: IFileSystemManagerFactory,
    repoManagerFactory: IRepositoryManagerFactory,
): Router {
    const router: Router = Router();
    const persistLatestFullSummary: boolean = store.get("git:persistLatestFullSummary") ?? false;

    /**
     * Retrieves a summary.
     * If sha is "latest", returns latest summary for owner/repo.
     */
    router.get("/repos/:owner/:repo/git/summaries/:sha", async (request, response) => {
        const storageRoutingId: string = request.get(Constants.StorageRoutingIdHeader);
        const [tenantId,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(
                Promise.reject(new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`)),
                response);
            return;
        }
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => getSummary(
                repoManager,
                fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams),
                request.params.sha,
                documentId,
                tenantId,
                getExternalWriterParams(request.query?.config as string | undefined),
                persistLatestFullSummary,
            ));
        handleResponse(resultP, response);
    });

    /**
     * Creates a new summary.
     */
    router.post("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const storageRoutingId: string = request.get(Constants.StorageRoutingIdHeader);
        const [tenantId,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(
                Promise.reject(new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`)),
                response);
            return;
        }
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const wholeSummaryPayload: IWholeSummaryPayload = request.body;
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager): Promise<IWriteSummaryResponse | IWholeFlatSummary> => createSummary(
                repoManager,
                fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams),
                wholeSummaryPayload,
                documentId,
                tenantId,
                getExternalWriterParams(request.query?.config as string | undefined),
                persistLatestFullSummary,
            ));
        handleResponse(resultP, response, undefined, undefined, 201);
    });

    /**
     * Deletes the latest summary for the given document.
     * If header Soft-Delete="true", only flags summary as deleted.
     */
    router.delete("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const storageRoutingId: string = request.get(Constants.StorageRoutingIdHeader);
        const [tenantId,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(
                Promise.reject(new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`)),
                response);
            return;
        }
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => deleteSummary(
                repoManager,
                fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams),
                documentId,
                tenantId,
                softDelete,
                getExternalWriterParams(request.query?.config as string | undefined),
                persistLatestFullSummary,
            ));
        handleResponse(resultP, response, undefined, undefined, 204);
    });

    return router;
}

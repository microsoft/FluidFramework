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
import { handleResponse } from "@fluidframework/server-services-shared";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Router } from "express";
import { Provider } from "nconf";
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
    logAndThrowApiError,
    BaseGitRestTelemetryProperties,
    IRepoManagerParams,
    getLumberjackBasePropertiesFromRepoManagerParams,
    getRepoManagerFromWriteAPI,
} from "../utils";

function getFullSummaryDirectory(repoManager: IRepositoryManager, documentId: string): string {
    return `${repoManager.path}/${documentId}`;
}

async function getSummary(
    repoManager: IRepositoryManager,
    fileSystemManager: IFileSystemManager,
    sha: string,
    repoManagerParams: IRepoManagerParams,
    externalWriterConfig?: IExternalWriterConfig,
    persistLatestFullSummary = false,
): Promise<IWholeFlatSummary> {
    const lumberjackProperties = {
        ...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
        [BaseGitRestTelemetryProperties.sha]: sha,
    };

    if (persistLatestFullSummary && sha === latestSummarySha) {
        try {
            const latestFullSummaryFromStorage = await retrieveLatestFullSummaryFromStorage(
                fileSystemManager,
                getFullSummaryDirectory(repoManager, repoManagerParams.storageRoutingId.documentId),
            );
            if (latestFullSummaryFromStorage !== undefined) {
                return latestFullSummaryFromStorage;
            }
        } catch (error) {
            // This read is for optimization purposes, so on failure
            // we can try to read the summary in typical fashion.
            Lumberjack.error(
                "Failed to read latest full summary from storage.",
                lumberjackProperties,
                error);
        }
    }

    // If we get to this point, it's because one of the options below:
    // 1) we did not want to read the latest full summary from storage
    // 2) we wanted to read the latest full summary, but it did not exist in the storage
    // 3) the summary being requestd is not the latest
    // Therefore, we need to compute the summary from scratch.
    const wholeSummaryManager = new GitWholeSummaryManager(
        repoManagerParams.storageRoutingId.documentId,
        repoManager,
        externalWriterConfig?.enabled ?? false,
    );
    const fullSummary = await wholeSummaryManager.readSummary(sha);

    // Now that we computed the summary from scratch, we can persist it to storage if
    // the following conditions are met.
    if (persistLatestFullSummary && sha === latestSummarySha && fullSummary) {
        // We persist the full summary in a fire-and-forget way because we don't want it
        // to impact getSummary latency. So upon computing the full summary above, we should
        // return as soon as possible. Also, we don't care about failures much, since the
        // next getSummary or a createSummary request may trigger persisting to storage.
        persistLatestFullSummaryInStorage(
            fileSystemManager,
            getFullSummaryDirectory(repoManager, repoManagerParams.storageRoutingId.documentId),
            fullSummary,
        ).catch((error) => {
            Lumberjack.error(
                "Failed to persist latest full summary to storage during getSummary",
                lumberjackProperties,
                error);
        });
    }

    return wholeSummaryManager.readSummary(sha);
}

async function createSummary(
    repoManager: IRepositoryManager,
    fileSystemManager: IFileSystemManager,
    payload: IWholeSummaryPayload,
    repoManagerParams: IRepoManagerParams,
    externalWriterConfig?: IExternalWriterConfig,
    persistLatestFullSummary = false,
): Promise<IWriteSummaryResponse | IWholeFlatSummary> {
    const wholeSummaryManager = new GitWholeSummaryManager(
        repoManagerParams.storageRoutingId.documentId,
        repoManager,
        externalWriterConfig?.enabled ?? false,
    );
    const lumberjackProperties = {
        ...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
        [BaseGitRestTelemetryProperties.summaryType]: payload?.type,
    };
    Lumberjack.info("Creating summary", lumberjackProperties);

    const {isNew, writeSummaryResponse} = await wholeSummaryManager.writeSummary(payload);

    // Waiting to pre-compute and persist latest summary would slow down document creation,
    // so skip this step if it is a new document.
    if (!isNew && isContainerSummary(payload)) {
        const latestFullSummary: IWholeFlatSummary | undefined = await wholeSummaryManager.readSummary(
            writeSummaryResponse.id,
        ).catch((error) => {
            // This read is for Historian caching purposes, so it should be ignored on failure.
            Lumberjack.error(
                "Failed to read latest summary after writing container summary",
                lumberjackProperties,
                error);
            return undefined;
        });
        if (latestFullSummary) {
            if (persistLatestFullSummary) {
                try {
                    // TODO: does this fail if file is open and still being written to from a previous request?
                    await persistLatestFullSummaryInStorage(
                        fileSystemManager,
                        getFullSummaryDirectory(repoManager, repoManagerParams.storageRoutingId.documentId),
                        latestFullSummary,
                    );
                } catch(error) {
                    Lumberjack.error(
                        "Failed to persist latest full summary to storage during createSummary",
                        lumberjackProperties,
                        error);
                    // TODO: Find and add more information about this failure so that Scribe can retry as necessary.
                    throw new NetworkError(
                        500,
                        "Failed to persist latest full summary to storage during createSummary");
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
    repoManagerParams: IRepoManagerParams,
    softDelete: boolean,
    repoPerDocEnabled: boolean,
    externalWriterConfig?: IExternalWriterConfig): Promise<void> {
    if(!repoPerDocEnabled) {
        throw new NetworkError(501, "Not Implemented");
    }
    const lumberjackProperties = {
        ...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
        [BaseGitRestTelemetryProperties.repoPerDocEnabled]: repoPerDocEnabled,
        // Currently, we ignore the softDelete header and always implement hard delete. Soft delete will come next.
        [BaseGitRestTelemetryProperties.softDelete]: false,
    };
    // In repo-per-doc model, the repoManager's path represents the directory that contains summary data.
    const summaryFolderPath = repoManager.path;
    Lumberjack.info(`Deleting summary`, lumberjackProperties);
    try {
        await fileSystemManager.promises.rm(summaryFolderPath, { recursive: true });
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            // File does not exist.
            Lumberjack.warning(
                "Tried to delete summary, but it does not exist",
                lumberjackProperties,
                error);
            return;
        }
        Lumberjack.error(
            "Failed to delete summary",
            lumberjackProperties,
            error);
        throw error;
    }
}

export function create(
    store: Provider,
    fileSystemManagerFactory: IFileSystemManagerFactory,
    repoManagerFactory: IRepositoryManagerFactory,
): Router {
    const router: Router = Router();
    const persistLatestFullSummary: boolean = store.get("git:persistLatestFullSummary") ?? false;
    const repoPerDocEnabled: boolean = store.get("git:repoPerDocEnabled") ?? false;

    /**
     * Retrieves a summary.
     * If sha is "latest", returns latest summary for owner/repo.
     */
    router.get("/repos/:owner/:repo/git/summaries/:sha", async (request, response) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        if (!repoManagerParams.storageRoutingId?.tenantId ||
            !repoManagerParams.storageRoutingId?.documentId) {
            handleResponse(
                Promise.reject(new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`)),
                response);
            return;
        }
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => getSummary(
                repoManager,
                fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams),
                request.params.sha,
                repoManagerParams,
                getExternalWriterParams(request.query?.config as string | undefined),
                persistLatestFullSummary,
            )).catch((error) => logAndThrowApiError(error, request, repoManagerParams));
        handleResponse(resultP, response);
    });

    /**
     * Creates a new summary.
     */
    router.post("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        if (!repoManagerParams.storageRoutingId?.tenantId ||
            !repoManagerParams.storageRoutingId?.documentId) {
            handleResponse(
                Promise.reject(new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`)),
                response);
            return;
        }
        const wholeSummaryPayload: IWholeSummaryPayload = request.body;
        const resultP = getRepoManagerFromWriteAPI(repoManagerFactory, repoManagerParams, repoPerDocEnabled)
            .then(async (repoManager): Promise<IWriteSummaryResponse | IWholeFlatSummary> => createSummary(
                repoManager,
                fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams),
                wholeSummaryPayload,
                repoManagerParams,
                getExternalWriterParams(request.query?.config as string | undefined),
                persistLatestFullSummary,
            )).catch((error) => logAndThrowApiError(error, request, repoManagerParams));
        handleResponse(resultP, response, undefined, undefined, 201);
    });

    /**
     * Deletes the latest summary for the given document.
     * If header Soft-Delete="true", only flags summary as deleted.
     */
    router.delete("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        if (!repoManagerParams.storageRoutingId?.tenantId ||
            !repoManagerParams.storageRoutingId?.documentId) {
            handleResponse(
                Promise.reject(new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`)),
                response);
            return;
        }
        const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => deleteSummary(
                repoManager,
                fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams),
                repoManagerParams,
                softDelete,
                repoPerDocEnabled,
                getExternalWriterParams(request.query?.config as string | undefined),
            )).catch((error) => logAndThrowApiError(error, request, repoManagerParams));
        handleResponse(resultP, response, undefined, undefined, 204);
    });

    return router;
}

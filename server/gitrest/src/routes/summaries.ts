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
import { getExternalWriterParams, IRepositoryManagerFactory } from "../utils";
import { handleResponse } from "./utils";

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
        ).then(async (repoManager) => repoManager.getSummary(
            request.params.sha,
            documentId,
            getExternalWriterParams(request.query?.config as string | undefined),
        ));
        handleResponse(resultP, response);
    });

    /**
     * Creates a new summary.
     */
    router.post("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const storageRoutingId: string = request.get("Storage-Routing-Id");
        const [,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(Promise.reject(new NetworkError(400, "Invalid Storage-Routing-Id header")), response);
            return;
        }
        const wholeSummaryPayload: IWholeSummaryPayload = request.body;
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager): Promise<IWriteSummaryResponse | IWholeFlatSummary> => {
            const writeSummaryResponse = await repoManager.createSummary(
                wholeSummaryPayload,
                documentId,
                getExternalWriterParams(request.query?.config as string | undefined),
            );
            return writeSummaryResponse;
        });
        handleResponse(resultP, response, 201);
    });

    /**
     * Deletes the latest summary for the given document.
     * If header Soft-Delete="true", only flags summary as deleted.
     */
    router.delete("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const storageRoutingId: string = request.get("Storage-Routing-Id");
        const [,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(Promise.reject(new NetworkError(400, "Invalid Storage-Routing-Id header")), response);
            return;
        }
        const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.deleteSummary(documentId, softDelete));
        handleResponse(resultP, response, 204);
    });

    return router;
}

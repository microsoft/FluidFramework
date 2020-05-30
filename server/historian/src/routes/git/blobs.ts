/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, tenantService: ITenantService, cache: ICache): Router {
    const router: Router = Router();

    async function createBlob(
        tenantId: string,
        authorization: string,
        body: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.createBlob(body);
    }

    async function getBlob(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<git.IBlob> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getBlob(sha, useCache);
    }

    router.post("/repos/:ignored?/:tenantId/git/blobs", (request, response, next) => {
        const blobP = createBlob(request.params.tenantId, request.get("Authorization"), request.body);
        utils.handleResponse(
            blobP,
            response,
            false,
            201);
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:ignored?/:tenantId/git/blobs/:sha", (request, response, next) => {
        const useCache = !("disableCache" in request.query);
        const blobP = getBlob(request.params.tenantId, request.get("Authorization"), request.params.sha, useCache);
        utils.handleResponse(
            blobP,
            response,
            useCache);
    });

    /**
     * Retrieves the given blob as an image
     */
    router.get("/repos/:ignored?/:tenantId/git/blobs/raw/:sha", (request, response, next) => {
        const useCache = !("disableCache" in request.query);

        const blobP = getBlob(request.params.tenantId, request.get("Authorization"), request.params.sha, useCache);

        blobP.then((blob) => {
            if (useCache) {
                response.setHeader("Cache-Control", "public, max-age=31536000");
            }
            response.status(200).write(Buffer.from(blob.content, "base64"), () => response.end());
        },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@prague/gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function createBlob(
        tenantId: string,
        authorization: string,
        body: git.ICreateBlobParams,
    ): Promise<git.ICreateBlobResponse> {
        throw new Error("Not implemented");
    }

    async function getBlob(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean,
    ): Promise<git.IBlob> {
        throw new Error("Not implemented");
    }

    router.post(
        "/repos/:ignored?/:tenantId/git/blobs",
        (request, response) => {
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
    router.get(
        "/repos/:ignored?/:tenantId/git/blobs/:sha",
        (request, response) => {
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
    router.get(
        "/repos/:ignored?/:tenantId/git/blobs/raw/:sha",
        (request, response) => {
            const useCache = !("disableCache" in request.query);

            const blobP = getBlob(request.params.tenantId, request.get("Authorization"), request.params.sha, useCache);

            blobP.then((blob) => {
                if (useCache) {
                    response.setHeader("Cache-Control", "public, max-age=31536000");
                }
                response.status(200).write(new Buffer(blob.content, "base64"), () => response.end());
            },
            (error) => {
                response.status(400).json(error);
            });
        });

    return router;
}

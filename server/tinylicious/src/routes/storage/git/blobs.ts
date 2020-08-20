/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ICreateBlobParams, ICreateBlobResponse } from "@fluidframework/gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import * as nconf from "nconf";
import * as utils from "../utils";

export async function createBlob(
    store: nconf.Provider,
    tenantId: string,
    authorization: string,
    body: ICreateBlobParams,
): Promise<ICreateBlobResponse> {
    const buffer = Buffer.from(body.content, body.encoding);

    const sha = await git.writeObject({
        dir: utils.getGitDir(store, tenantId),
        type: "blob",
        object: buffer,
    });

    return {
        sha,
        url: "",
    };
}

export async function getBlob(
    store: nconf.Provider,
    tenantId: string,
    authorization: string,
    sha: string,
    useCache: boolean,
): Promise<IBlob> {
    const gitObj = await git.readObject({ dir: utils.getGitDir(store, tenantId), oid: sha });
    const buffer = gitObj.object as Buffer;

    const result: IBlob = {
        url: "",
        sha,
        size: buffer.length,
        content: buffer.toString("base64"),
        encoding: "base64",
    };

    return result;
}

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    router.post(
        "/repos/:ignored?/:tenantId/git/blobs",
        (request, response) => {
            const blobP = createBlob(
                store,
                request.params.tenantId,
                request.get("Authorization"),
                request.body);

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
            const blobP = getBlob(
                store,
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha,
                useCache);

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

            const blobP = getBlob(
                store,
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha,
                useCache);

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

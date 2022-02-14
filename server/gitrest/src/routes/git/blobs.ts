/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateBlobParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { IRepositoryManagerFactory } from "../../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.post("/repos/:owner/:repo/git/blobs", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.createBlob(
            request.body as ICreateBlobParams,
        );
        return resultP.then(
            (blob) => {
                response.status(201).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:owner/:repo/git/blobs/:sha", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.getBlob(
            request.params.sha,
        );
        return resultP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}

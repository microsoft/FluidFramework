/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateBlobParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.post("/repos/:owner/:repo/git/blobs", async (request, response, next) => {
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.createBlob(
            request.body as ICreateBlobParams,
        ));

        handleResponse(resultP, response, 201);
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:owner/:repo/git/blobs/:sha", async (request, response, next) => {
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.getBlob(
            request.params.sha,
        ));

        handleResponse(resultP, response);
    });

    return router;
}

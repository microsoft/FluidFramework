/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRepoParams } from "@fluidframework/gitresources";
import { handleResponse } from "@fluidframework/server-services-shared";
import { Router } from "express";
import nconf from "nconf";
import { getRepoManagerParamsFromRequest, IRepositoryManagerFactory, logAndThrowApiError } from "../../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    /**
     * Creates a new git repository
     */
    router.post("/:owner/repos", (request, response, next) => {
        const createParams = request.body as ICreateRepoParams;
        if (!createParams || !createParams.name) {
            return response.status(400).json("Invalid repo name");
        }

        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const repoManagerP = repoManagerFactory.create({ ...repoManagerParams, repoName: createParams.name })
            .then(() => undefined)
            .catch((error) => logAndThrowApiError(error, request, repoManagerParams));

        handleResponse(repoManagerP, response, undefined, undefined, 201);
    });

    /**
     * Retrieves an existing get repository
     */
    router.get("/repos/:owner/:repo", (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const repoManagerP = repoManagerFactory.open(repoManagerParams)
            .then(() => ({ name: request.params.repo }))
            .catch((error) => logAndThrowApiError(error, request, repoManagerParams));

        handleResponse(repoManagerP, response);
    });

    return router;
}

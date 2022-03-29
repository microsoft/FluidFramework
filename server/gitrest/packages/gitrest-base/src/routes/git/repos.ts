/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRepoParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

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

        const repoManagerP = repoManagerFactory.create(
            request.params.owner,
            createParams.name,
        );

        handleResponse(repoManagerP.then(() => undefined), response, 201);
    });

    /**
     * Retrieves an existing get repository
     */
    router.get("/repos/:owner/:repo", (request, response, next) => {
        const repoManagerP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );

        handleResponse(repoManagerP.then(() => ({ name: request.params.repo })), response);
    });

    return router;
}

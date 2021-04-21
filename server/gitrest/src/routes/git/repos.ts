/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRepoParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import * as utils from "../../utils";

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    /**
     * Creates a new git repository
     */
    router.post("/:owner/repos", (request, response, next) => {
        const createParams = request.body as ICreateRepoParams;
        if (!createParams || !createParams.name) {
            return response.status(400).json("Invalid repo name");
        }

        const repoP = repoManager.create(request.params.owner, createParams.name);
        repoP.then(
            (repository) => {
                return response.status(201).json();
            },
            (error) => {
                return response.status(400).json();
            });
    });

    /**
     * Retrieves an existing get repository
     */
    router.get("/repos/:owner/:repo", (request, response, next) => {
        const repoP = repoManager.open(request.params.owner, request.params.repo);
        repoP.then(
            (repository) => {
                return response.status(200).json({ name: request.params.repo });
            },
            (error) => {
                return response.status(400).end();
            });
    });

    return router;
}

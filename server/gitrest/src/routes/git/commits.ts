/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateCommitParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { IRepositoryManagerFactory } from "../../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    // * https://developer.github.com/v3/git/commits/

    router.post("/repos/:owner/:repo/git/commits", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.createCommit(request.body as ICreateCommitParams);
        return resultP.then(
            (blob) => {
                response.status(201).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    router.get("/repos/:owner/:repo/git/commits/:sha", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.getCommit(request.params.sha);
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

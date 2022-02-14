/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTreeParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { IRepositoryManagerFactory } from "../../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.post("/repos/:owner/:repo/git/trees", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.createTree(request.body as ICreateTreeParams);
        return resultP.then(
            (tree) => {
                response.status(201).json(tree);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    router.get("/repos/:owner/:repo/git/trees/:sha", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.getTree(request.params.sha, request.query.recursive === "1");
        return resultP.then(
            (tree) => {
                response.status(200).json(tree);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}

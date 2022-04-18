/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateCommitParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { getRepoManagerParamsFromRequest, IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    // * https://developer.github.com/v3/git/commits/

    router.post("/repos/:owner/:repo/git/commits", async (request, response, next) => {
        const resultP = repoManagerFactory.open(getRepoManagerParamsFromRequest(request))
            .then(async (repoManager) => repoManager.createCommit(request.body as ICreateCommitParams));

        handleResponse(resultP, response, undefined, undefined, 201);
    });

    router.get("/repos/:owner/:repo/git/commits/:sha", async (request, response, next) => {
        const resultP = repoManagerFactory.open(getRepoManagerParamsFromRequest(request))
            .then(async (repoManager) => repoManager.getCommit(request.params.sha));

        handleResponse(resultP, response);
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTagParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { getRepoManagerParamsFromRequest, IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/git/tags/

    router.post("/repos/:owner/:repo/git/tags", async (request, response, next) => {
        const resultP = repoManagerFactory.open(getRepoManagerParamsFromRequest(request))
            .then(async (repoManager) => repoManager.createTag(request.body as ICreateTagParams));

        handleResponse(resultP, response, undefined, undefined, 201);
    });

    router.get("/repos/:owner/:repo/git/tags/*", async (request, response, next) => {
        const resultP = repoManagerFactory.open(getRepoManagerParamsFromRequest(request))
            .then(async (repoManager) => repoManager.getTag(request.params[0]));

        handleResponse(resultP, response);
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTreeParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import { Constants, IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.post("/repos/:owner/:repo/git/trees", async (request, response, next) => {
        const storageName: string | undefined = request.get(Constants.StorageNameHeader);
        const resultP = repoManagerFactory.open({
            repoOwner: request.params.owner,
            repoName: request.params.repo,
            fileSystemManagerParams: {
                storageName,
            },
        }).then(async (repoManager) => repoManager.createTree(request.body as ICreateTreeParams));

        handleResponse(resultP, response, 201);
    });

    router.get("/repos/:owner/:repo/git/trees/:sha", async (request, response, next) => {
        const storageName: string | undefined = request.get(Constants.StorageNameHeader);
        const resultP = repoManagerFactory.open({
            repoOwner: request.params.owner,
            repoName: request.params.repo,
            fileSystemManagerParams: {
                storageName,
            },
        }).then(async (repoManager) => repoManager.getTree(request.params.sha, request.query.recursive === "1"));

        handleResponse(resultP, response);
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateCommitParams } from "@fluidframework/gitresources";
import { handleResponse } from "@fluidframework/server-services-shared";
import { Router } from "express";
import nconf from "nconf";
import {
    checkSoftDeleted,
    getRepoManagerFromWriteAPI,
    getRepoManagerParamsFromRequest,
    IFileSystemManagerFactory,
    IRepositoryManagerFactory,
    logAndThrowApiError,
} from "../../utils";

export function create(
    store: nconf.Provider,
    fileSystemManagerFactory: IFileSystemManagerFactory,
    repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();
    const repoPerDocEnabled: boolean = store.get("git:repoPerDocEnabled") ?? false;

    // * https://developer.github.com/v3/git/commits/

    router.post("/repos/:owner/:repo/git/commits", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const resultP = getRepoManagerFromWriteAPI(repoManagerFactory, repoManagerParams, repoPerDocEnabled)
            .then(async (repoManager) => {
                const fsManager = fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams);
                await checkSoftDeleted(fsManager, repoManager.path, repoManagerParams, repoPerDocEnabled);
                return repoManager.createCommit(request.body as ICreateCommitParams);
            }).catch((error) => logAndThrowApiError(error, request, repoManagerParams));

        handleResponse(resultP, response, undefined, undefined, 201);
    });

    router.get("/repos/:owner/:repo/git/commits/:sha", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => {
                const fsManager = fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams);
                await checkSoftDeleted(fsManager, repoManager.path, repoManagerParams, repoPerDocEnabled);
                return repoManager.getCommit(request.params.sha);
            }).catch((error) => logAndThrowApiError(error, request, repoManagerParams));

        handleResponse(resultP, response);
    });

    return router;
}

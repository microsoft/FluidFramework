/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICreateRefParamsExternal,
    IPatchRefParamsExternal } from "@fluidframework/server-services-client";
import { handleResponse } from "@fluidframework/server-services-shared";
import { Router } from "express";
import nconf from "nconf";
import {
    getExternalWriterParams,
    getRepoManagerFromWriteAPI,
    getRepoManagerParamsFromRequest,
    IRepositoryManagerFactory,
    logAndThrowApiError,
} from "../../utils";

/**
 * Simple method to convert from a path id to the git reference ID
 */
function getRefId(id): string {
    return `refs/${id}`;
}

export function create(
    store: nconf.Provider,
    repoManagerFactory: IRepositoryManagerFactory,
): Router {
    const router: Router = Router();
    const repoPerDocEnabled: boolean = store.get("git:repoPerDocEnabled") ?? false;

    // https://developer.github.com/v3/git/refs/

    router.get("/repos/:owner/:repo/git/refs", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => repoManager.getRefs())
            .catch((error) => logAndThrowApiError(error, request, repoManagerParams));

        handleResponse(resultP, response);
    });

    router.get("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => repoManager.getRef(
                getRefId(request.params[0]),
                getExternalWriterParams(request.query?.config as string),
            )).catch((error) => logAndThrowApiError(error, request, repoManagerParams));
        handleResponse(resultP, response);
    });

    router.post("/repos/:owner/:repo/git/refs", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const createRefParams = request.body as ICreateRefParamsExternal;
        const resultP = getRepoManagerFromWriteAPI(repoManagerFactory, repoManagerParams, repoPerDocEnabled)
            .then(async (repoManager) => repoManager.createRef(
                createRefParams,
                createRefParams.config,
            )).catch((error) => logAndThrowApiError(error, request, repoManagerParams));
        handleResponse(resultP, response, undefined, undefined, 201);
    });

    router.patch("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const patchRefParams = request.body as IPatchRefParamsExternal;
        const resultP = getRepoManagerFromWriteAPI(repoManagerFactory, repoManagerParams, repoPerDocEnabled)
            .then(async (repoManager) => repoManager.patchRef(
                getRefId(request.params[0]),
                patchRefParams,
                patchRefParams.config,
            )).catch((error) => logAndThrowApiError(error, request, repoManagerParams));
        handleResponse(resultP, response);
    });

    router.delete("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => repoManager.deleteRef(getRefId(request.params[0])))
            .catch((error) => logAndThrowApiError(error, request, repoManagerParams));

        handleResponse(resultP, response, undefined, undefined, 204);
    });
    return router;
}

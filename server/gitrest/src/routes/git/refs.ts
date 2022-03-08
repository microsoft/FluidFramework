/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICreateRefParamsExternal,
    IPatchRefParamsExternal } from "@fluidframework/server-services-client";
import { Router } from "express";
import nconf from "nconf";
import { getExternalWriterParams, IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

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

    // https://developer.github.com/v3/git/refs/

    router.get("/repos/:owner/:repo/git/refs", async (request, response, next) => {
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.getRefs());
        handleResponse(resultP, response);
    });

    router.get("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.getRef(
            getRefId(request.params[0]),
            getExternalWriterParams(request.query?.config as string),
        ));
        handleResponse(resultP, response);
    });

    router.post("/repos/:owner/:repo/git/refs", async (request, response, next) => {
        const createRefParams = request.body as ICreateRefParamsExternal;
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.createRef(
            createRefParams,
            createRefParams.config,
        ));
        handleResponse(resultP, response, 201);
    });

    router.patch("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
        const patchRefParams = request.body as IPatchRefParamsExternal;
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.patchRef(
            getRefId(request.params[0]),
            patchRefParams,
            patchRefParams.config,
        ));
        handleResponse(resultP, response);
    });

    router.delete("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then(async (repoManager) => repoManager.deleteRef(getRefId(request.params[0])));
        handleResponse(resultP, response, 204);
    });
    return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { handleResponse } from "@fluidframework/server-services-shared";
import { Router } from "express";
import nconf from "nconf";
import { getRepoManagerParamsFromRequest, IRepositoryManagerFactory, logAndThrowApiError } from "../../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.get("/repos/:owner/:repo/contents/*", async (request, response, next) => {
        const repoManagerParams = getRepoManagerParamsFromRequest(request);
        const resultP = repoManagerFactory.open(repoManagerParams)
            .then(async (repoManager) => repoManager.getContent(
                request.query.ref as string,
                request.params[0],
            )).catch((error) => logAndThrowApiError(error, request, repoManagerParams));
            handleResponse(resultP, response);
    });

    return router;
}

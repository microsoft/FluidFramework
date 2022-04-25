/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { getRepoManagerParamsFromRequest, IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.get("/repos/:owner/:repo/contents/*", async (request, response, next) => {
        const resultP = repoManagerFactory.open(getRepoManagerParamsFromRequest(request))
            .then(async (repoManager) => repoManager.getContent(
                request.query.ref as string,
                request.params[0],
            ));
            handleResponse(resultP, response);
    });

    return router;
}

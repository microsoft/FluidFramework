/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { getExternalWriterParams, getRepoManagerParamsFromRequest, IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/repos/commits/
    // sha
    // path
    // author
    // since
    // until
    router.get("/repos/:owner/:repo/commits", async (request, response, next) => {
        const resultP = repoManagerFactory.open(getRepoManagerParamsFromRequest(request))
            .then(async (repoManager) => repoManager.getCommits(
                request.query.sha as string,
                Number(request.query.count as string),
                getExternalWriterParams(request.query?.config as string),
            ));
        handleResponse(resultP, response);
    });

    return router;
}

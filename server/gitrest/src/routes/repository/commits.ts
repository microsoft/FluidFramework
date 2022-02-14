/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { getExternalWriterParams, IRepositoryManagerFactory } from "../../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/repos/commits/
    // sha
    // path
    // author
    // since
    // until
    router.get("/repos/:owner/:repo/commits", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.getCommits(
            request.query.sha as string,
            Number(request.query.count as string),
            getExternalWriterParams(request.query?.config as string),
        );
        return resultP.then(
            (result) => {
                response.status(200).json(result);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}

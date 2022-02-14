/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { IRepositoryManagerFactory } from "../../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.get("/repos/:owner/:repo/contents/*", async (request, response, next) => {
        const repoManager = await repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        );
        const resultP = repoManager.getContent(
            request.query.ref as string,
            request.params[0],
        );
        return resultP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}

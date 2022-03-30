/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { Constants, IRepositoryManagerFactory } from "../../utils";
import { handleResponse } from "../utils";

export function create(store: nconf.Provider, repoManagerFactory: IRepositoryManagerFactory): Router {
    const router: Router = Router();

    router.get("/repos/:owner/:repo/contents/*", async (request, response, next) => {
        const storageName: string | undefined = request.get(Constants.StorageNameHeader);
        const resultP = repoManagerFactory.open({
            repoOwner: request.params.owner,
            repoName: request.params.repo,
            fileSystemManagerParams: {
                storageName,
            },
        }).then(async (repoManager) => repoManager.getContent(
            request.query.ref as string,
            request.params[0],
        ));
        handleResponse(resultP, response);
    });

    return router;
}

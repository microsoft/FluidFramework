/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { Constants, getExternalWriterParams, IRepositoryManagerFactory } from "../../utils";
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
        const storageName: string | undefined = request.get(Constants.StorageNameHeader);
        const resultP = repoManagerFactory.open({
            repoOwner: request.params.owner,
            repoName: request.params.repo,
            fileSystemManagerParams: {
                storageName,
            },
        }).then(async (repoManager) => repoManager.getCommits(
            request.query.sha as string,
            Number(request.query.count as string),
            getExternalWriterParams(request.query?.config as string),
        ));
        handleResponse(resultP, response);
    });

    return router;
}

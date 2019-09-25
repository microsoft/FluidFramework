/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICreateCommitParams } from "@prague/gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function createCommit(
        tenantId: string,
        authorization: string,
        params: ICreateCommitParams,
    ): Promise<ICommit> {
        throw new Error("Not implemented");
    }

    async function getCommit(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean,
    ): Promise<ICommit> {
        throw new Error("Not implemented");
    }

    router.post(
        "/repos/:ignored?/:tenantId/git/commits",
        (request, response) => {
            const commitP = createCommit(request.params.tenantId, request.get("Authorization"), request.body);

            utils.handleResponse(
                commitP,
                response,
                false,
                201);
        });

    router.get(
        "/repos/:ignored?/:tenantId/git/commits/:sha",
        (request, response) => {
            const useCache = !("disableCache" in request.query);
            const commitP = getCommit(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha,
                useCache);

            utils.handleResponse(commitP, response, useCache);
        });

    return router;
}

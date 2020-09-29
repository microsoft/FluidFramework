/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, tenantService: ITenantService, cache: ICache): Router {
    const router: Router = Router();

    async function getCommits(
        tenantId: string,
        authorization: string,
        sha: string,
        count: number): Promise<git.ICommitDetails[]> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getCommits(sha, count);
    }

    router.get("/repos/:ignored?/:tenantId/commits", (request, response, next) => {
        const commitsP = getCommits(
            request.params.tenantId,
            request.get("Authorization"),
            request.query.sha,
            request.query.count);

        utils.handleResponse(
            commitsP,
            response,
            false);
    });

    return router;
}

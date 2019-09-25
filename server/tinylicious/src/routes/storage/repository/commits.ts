/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@prague/gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function getCommits(
        tenantId: string,
        authorization: string,
        sha: string,
        count: number,
    ): Promise<git.ICommitDetails[]> {
        return [];
    }

    router.get(
        "/repos/:ignored?/:tenantId/commits",
        (request, response) => {
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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import { IThrottler } from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle } from "@fluidframework/server-services-utils";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";

export function create(
    store: nconf.Provider,
    tenantService: ITenantService,
    cache: ICache,
    throttler: IThrottler): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => utils.getParam(req.params, "tenantId"),
        throttleIdSuffix: utils.Constants.throttleIdSuffix,
    };

    async function getCommits(
        tenantId: string,
        authorization: string,
        sha: string,
        count: number): Promise<git.ICommitDetails[]> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getCommits(sha, count);
    }

    router.get("/repos/:ignored?/:tenantId/commits",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const commitsP = getCommits(
                request.params.tenantId,
                request.get("Authorization"),
                utils.queryParamToString(request.query.sha),
                utils.queryParamToNumber(request.query.count));

            utils.handleResponse(
                commitsP,
                response,
                false);
    });

    return router;
}

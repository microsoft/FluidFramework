/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as git from "@fluidframework/gitresources";
import { IThrottler } from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle, getParam } from "@fluidframework/server-services-utils";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";

export function create(
    config: nconf.Provider,
    tenantService: ITenantService,
    throttler: IThrottler,
    cache?: ICache,
    asyncLocalStorage?: AsyncLocalStorage<string>): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
        throttleIdSuffix: utils.Constants.throttleIdSuffix,
    };

    async function getCommits(
        tenantId: string,
        authorization: string,
        sha: string,
        count: number): Promise<git.ICommitDetails[]> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getCommits(sha, count);
    }

    router.get("/repos/:ignored?/:tenantId/commits",
        utils.validateRequestParams("sha"),
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

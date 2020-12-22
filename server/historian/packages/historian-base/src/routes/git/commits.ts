/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICreateCommitParams } from "@fluidframework/gitresources";
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

    async function createCommit(
        tenantId: string,
        authorization: string,
        params: ICreateCommitParams): Promise<ICommit> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.createCommit(params);
    }

    async function getCommit(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<ICommit> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getCommit(sha, useCache);
    }

    router.post("/repos/:ignored?/:tenantId/git/commits",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const commitP = createCommit(request.params.tenantId, request.get("Authorization"), request.body);

            utils.handleResponse(
                commitP,
                response,
                false,
                201);
    });

    router.get("/repos/:ignored?/:tenantId/git/commits/:sha",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const useCache = !("disableCache" in request.query);
            const commitP = getCommit(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha, useCache);

            utils.handleResponse(commitP, response, useCache);
    });

    return router;
}

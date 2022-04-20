/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { ICommit, ICreateCommitParams } from "@fluidframework/gitresources";
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

    async function createCommit(
        tenantId: string,
        authorization: string,
        params: ICreateCommitParams): Promise<ICommit> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.createCommit(params);
    }

    async function getCommit(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<ICommit> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getCommit(sha, useCache);
    }

    router.post("/repos/:ignored?/:tenantId/git/commits",
        utils.validateRequestParams("tenantId"),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const commitP = createCommit(request.params.tenantId, request.get("Authorization"), request.body);

            utils.handleResponse(
                commitP,
                response,
                false,
                undefined,
                201);
    });

    router.get("/repos/:ignored?/:tenantId/git/commits/:sha",
        utils.validateRequestParams("tenantId", "sha"),
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

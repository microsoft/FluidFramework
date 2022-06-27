/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IHeader } from "@fluidframework/gitresources";
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

    async function getHeader(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<IHeader> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getHeader(sha, useCache);
    }

    async function getTree(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<any> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getFullTree(sha, useCache);
    }

    router.get("/repos/:ignored?/:tenantId/headers/:sha",
        utils.validateRequestParams("tenantId", "sha"),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const useCache = !("disableCache" in request.query);
            const headerP = getHeader(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha, useCache);
            utils.handleResponse(headerP, response, useCache);
    });

    router.get("/repos/:ignored?/:tenantId/tree/:sha",
        utils.validateRequestParams("tenantId", "sha"),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const useCache = !("disableCache" in request.query);
            const headerP = getTree(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha, useCache);
            utils.handleResponse(headerP, response, useCache);
    });

    return router;
}

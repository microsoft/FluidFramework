/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IHeader } from "@fluidframework/gitresources";
import { IThrottler } from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle } from "@fluidframework/server-services-utils";
import { Router } from "express";
import nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";

export function create(
    store: nconf.Provider,
    tenantService: ITenantService,
    cache: ICache,
    throttler: IThrottler,
    asyncLocalStorage?: AsyncLocalStorage<string>): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => utils.getParam(req.params, "tenantId"),
        throttleIdSuffix: utils.Constants.throttleIdSuffix,
    };

    async function getHeader(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<IHeader> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache, asyncLocalStorage);
        return service.getHeader(sha, useCache);
    }

    async function getTree(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<any> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache, asyncLocalStorage);
        return service.getFullTree(sha, useCache);
    }

    router.get("/repos/:ignored?/:tenantId/headers/:sha",
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

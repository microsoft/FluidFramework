/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
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
    throttler: IThrottler,
    asyncLocalStorage?: AsyncLocalStorage<string>): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => utils.getParam(req.params, "tenantId"),
        throttleIdSuffix: utils.Constants.throttleIdSuffix,
    };

    async function createTag(
        tenantId: string,
        authorization: string,
        params: git.ICreateTagParams): Promise<git.ITag> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache, asyncLocalStorage);
        return service.createTag(params);
    }

    async function getTag(tenantId: string, authorization: string, tag: string): Promise<git.ITag> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache, asyncLocalStorage);
        return service.getTag(tag);
    }

    router.post("/repos/:ignored?/:tenantId/git/tags",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const tagP = createTag(request.params.tenantId, request.get("Authorization"), request.body);
            utils.handleResponse(
                tagP,
                response,
                false,
                201);
    });

    router.get("/repos/:ignored?/:tenantId/git/tags/*",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const tagP = getTag(request.params.tenantId, request.get("Authorization"), request.params[0]);
            utils.handleResponse(
                tagP,
                response,
                false);
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as git from "@fluidframework/gitresources";
import { ICreateRefParamsExternal, IPatchRefParamsExternal } from "@fluidframework/server-services-client";
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

    async function getRefs(tenantId: string, authorization: string): Promise<git.IRef[]> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getRefs();
    }

    async function getRef(tenantId: string, authorization: string, ref: string): Promise<git.IRef> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getRef(ref);
    }

    async function createRef(
        tenantId: string,
        authorization: string,
        params: ICreateRefParamsExternal): Promise<git.IRef> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.createRef(params);
    }

    async function updateRef(
        tenantId: string,
        authorization: string,
        ref: string,
        params: IPatchRefParamsExternal): Promise<git.IRef> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.updateRef(ref, params);
    }

    async function deleteRef(
        tenantId: string,
        authorization: string,
        ref: string): Promise<void> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.deleteRef(ref);
    }

    router.get("/repos/:ignored?/:tenantId/git/refs",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const refsP = getRefs(request.params.tenantId, request.get("Authorization"));
            utils.handleResponse(
                refsP,
                response,
                false);
    });

    router.get("/repos/:ignored?/:tenantId/git/refs/*",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const refP = getRef(request.params.tenantId, request.get("Authorization"), request.params[0]);
            utils.handleResponse(
                refP,
                response,
                false);
    });

    router.post("/repos/:ignored?/:tenantId/git/refs",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const refP = createRef(request.params.tenantId, request.get("Authorization"), request.body);
            utils.handleResponse(
                refP,
                response,
                false,
                undefined,
                201);
    });

    router.patch("/repos/:ignored?/:tenantId/git/refs/*",
        utils.validateRequestParams("tenantId", 0),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const refP = updateRef(
                request.params.tenantId,
                request.get("Authorization"),
                request.params[0],
                request.body);
            utils.handleResponse(
                refP,
                response,
                false);
    });

    router.delete("/repos/:ignored?/:tenantId/git/refs/*",
        utils.validateRequestParams("tenantId", 0),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const refP = deleteRef(request.params.tenantId, request.get("Authorization"), request.params[0]);
            utils.handleResponse(
                refP,
                response,
                false,
                undefined,
                204);
    });

    return router;
}

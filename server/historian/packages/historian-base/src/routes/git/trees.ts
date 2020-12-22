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

    async function createTree(
        tenantId: string,
        authorization: string,
        params: git.ICreateTreeParams): Promise<git.ITree> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.createTree(params);
    }

    async function getTree(
        tenantId: string,
        authorization: string,
        sha: string,
        recursive: boolean,
        useCache: boolean): Promise<git.ITree> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getTree(sha, recursive, useCache);
    }

    router.post("/repos/:ignored?/:tenantId/git/trees",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const treeP = createTree(request.params.tenantId, request.get("Authorization"), request.body);
            utils.handleResponse(
                treeP,
                response,
                false,
                201);
    });

    router.get("/repos/:ignored?/:tenantId/git/trees/:sha",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const useCache = !("disableCache" in request.query);
            const treeP = getTree(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha,
                request.query.recursive === "1",
                useCache);
            utils.handleResponse(
                treeP,
                response,
                useCache);
    });

    return router;
}

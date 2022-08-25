/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
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

    async function getContent(
        tenantId: string,
        authorization: string,
        path: string,
        ref: string): Promise<any> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getContent(path, ref);
    }

    router.get("/repos/:ignored?/:tenantId/contents/*",
        utils.validateRequestParams("tenantId", 0),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const contentP = getContent(
                request.params.tenantId,
                request.get("Authorization"),
                request.params[0],
                utils.queryParamToString(request.query.ref));
            utils.handleResponse(
                contentP,
                response,
                false);
    });

    return router;
}

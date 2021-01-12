/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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

    async function getContent(
        tenantId: string,
        authorization: string,
        path: string,
        ref: string): Promise<any> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getContent(path, ref);
    }

    router.get("/repos/:ignored?/:tenantId/contents/*",
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

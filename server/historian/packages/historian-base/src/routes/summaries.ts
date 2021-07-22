/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IWholeSummaryPayload, IWriteSummaryResponse} from "@fluidframework/server-services-client";
import { IThrottler } from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle, getParam } from "@fluidframework/server-services-utils";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService } from "../services";
import * as utils from "./utils";

export function create(
    store: nconf.Provider,
    tenantService: ITenantService,
    cache: ICache,
    throttler: IThrottler,
    asyncLocalStorage?: AsyncLocalStorage<string>): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
        throttleIdSuffix: utils.Constants.throttleIdSuffix,
    };

    async function createSummary(
        tenantId: string,
        authorization: string,
        params: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache, asyncLocalStorage);
        return service.createSummary(params);
    }

    router.post("/repos/:ignored?/:tenantId/git/summaries",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const commitP = createSummary(request.params.tenantId, request.get("Authorization"), request.body);

            utils.handleResponse(
                commitP,
                response,
                false,
                201);
    });

    return router;
}

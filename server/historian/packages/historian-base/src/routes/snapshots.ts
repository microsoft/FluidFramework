/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IThrottler } from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle } from "@fluidframework/server-services-utils";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService } from "../services";
import * as contract from "../contract";
import * as utils from "./utils";

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

    async function createSnapshot(
        tenantId: string,
        authorization: string,
        params: contract.ISummaryPayload): Promise<contract.ISnapshotResponse> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache, asyncLocalStorage);
        return service.createSnapshot(params);
    }

    router.post("/:tenantId/:documentId/snapshots",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            //winston.info(`DEBUG-SUCCESS: ${documentId} ${options.method} ${options.url}`);
            const commitP = createSnapshot(request.params.tenantId, request.get("Authorization"), request.body);

            utils.handleResponse(
                commitP,
                response,
                false,
                201);
    });

    return router;
}

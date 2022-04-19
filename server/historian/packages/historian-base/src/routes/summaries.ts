/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IWholeFlatSummary, IWholeSummaryPayload, IWriteSummaryResponse } from "@fluidframework/server-services-client";
import { IThrottler } from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle, getParam } from "@fluidframework/server-services-utils";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService } from "../services";
import { parseToken } from "../utils";
import * as utils from "./utils";

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

    async function getSummary(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<IWholeFlatSummary> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.getSummary(sha, useCache);
    }

    async function createSummary(
        tenantId: string,
        authorization: string,
        params: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage);
        return service.createSummary(params);
    }

    async function deleteSummary(
        tenantId: string,
        authorization: string,
        softDelete: boolean): Promise<boolean[]> {
        const service = await utils.createGitService(
            config,
            tenantId,
            authorization,
            tenantService,
            cache,
            asyncLocalStorage,
            true);
        const deletionPs = [service.deleteSummary(softDelete)];
        if (!softDelete) {
            deletionPs.push(tenantService.deleteFromCache(tenantId, parseToken(tenantId, authorization)));
        }
        return Promise.all(deletionPs);
    }

    router.get("/repos/:ignored?/:tenantId/git/summaries/:sha",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const useCache = !("disableCache" in request.query);
            const summaryP = getSummary(
                request.params.tenantId, request.get("Authorization"), request.params.sha, useCache);

            utils.handleResponse(
                summaryP,
                response,
                // Browser caching for summary data should be disabled for now.
                false);
        });

    router.post("/repos/:ignored?/:tenantId/git/summaries",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const summaryP = createSummary(request.params.tenantId, request.get("Authorization"), request.body);

            utils.handleResponse(
                summaryP,
                response,
                false,
                undefined,
                201);
        });

    router.delete("/repos/:ignored?/:tenantId/git/summaries",
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
            const summaryP = deleteSummary(
                request.params.tenantId,
                request.get("Authorization"),
                softDelete);

            utils.handleResponse(
                summaryP,
                response,
                false);
        });

    return router;
}

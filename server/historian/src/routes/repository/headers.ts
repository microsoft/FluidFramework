/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHeader } from "@microsoft/fluid-gitresources";
import { Router } from "express";
import nconf from "nconf";
import { ICache, ITenantService } from "../../services";
import utils from "../utils";

export function create(store: nconf.Provider, tenantService: ITenantService, cache: ICache): Router {
    const router: Router = Router();

    async function getHeader(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<IHeader> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return await service.getHeader(sha, useCache);
    }

    async function getTree(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean): Promise<any> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getFullTree(sha, useCache);
    }

    router.get("/repos/:ignored?/:tenantId/headers/:sha", (request, response, next) => {
        const useCache = !("disableCache" in request.query);
        const headerP = getHeader(request.params.tenantId, request.get("Authorization"), request.params.sha, useCache);
        utils.handleResponse(headerP, response, useCache);
    });

    router.get("/repos/:ignored?/:tenantId/tree/:sha", (request, response, next) => {
        const useCache = !("disableCache" in request.query);
        const headerP = getTree(request.params.tenantId, request.get("Authorization"), request.params.sha, useCache);
        utils.handleResponse(headerP, response, useCache);
    });

    return router;
}

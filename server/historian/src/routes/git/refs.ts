/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@microsoft/fluid-gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, tenantService: ITenantService, cache: ICache): Router {
    const router: Router = Router();

    async function getRefs(tenantId: string, authorization: string): Promise<git.IRef[]> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getRefs();
    }

    async function getRef(tenantId: string, authorization: string, ref: string): Promise<git.IRef> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getRef(ref);
    }

    async function createRef(tenantId: string, authorization: string, params: git.ICreateRefParams): Promise<git.IRef> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.createRef(params);
    }

    async function updateRef(
        tenantId: string,
        authorization: string,
        ref: string,
        params: git.IPatchRefParams): Promise<git.IRef> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.updateRef(ref, params);
    }

    async function deleteRef(
        tenantId: string,
        authorization: string,
        ref: string): Promise<void> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.deleteRef(ref);
    }

    router.get("/repos/:ignored?/:tenantId/git/refs", (request, response, next) => {
        const refsP = getRefs(request.params.tenantId, request.get("Authorization"));
        utils.handleResponse(
            refsP,
            response,
            false);
    });

    router.get("/repos/:ignored?/:tenantId/git/refs/*", (request, response, next) => {
        const refP = getRef(request.params.tenantId, request.get("Authorization"), request.params[0]);
        utils.handleResponse(
            refP,
            response,
            false);
    });

    router.post("/repos/:ignored?/:tenantId/git/refs", (request, response, next) => {
        const refP = createRef(request.params.tenantId, request.get("Authorization"), request.body);
        utils.handleResponse(
            refP,
            response,
            false,
            201);
    });

    router.patch("/repos/:ignored?/:tenantId/git/refs/*", (request, response, next) => {
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

    router.delete("/repos/:ignored?/:tenantId/git/refs/*", (request, response, next) => {
        const refP = deleteRef(request.params.tenantId, request.get("Authorization"), request.params[0]);
        utils.handleResponse(
            refP,
            response,
            false,
            204);
    });

    return router;
}

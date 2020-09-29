/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import * as nconf from "nconf";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, tenantService: ITenantService, cache: ICache): Router {
    const router: Router = Router();

    async function getContent(
        tenantId: string,
        authorization: string,
        path: string,
        ref: string): Promise<any> {
        const service = await utils.createGitService(tenantId, authorization, tenantService, cache);
        return service.getContent(path, ref);
    }

    router.get("/repos/:ignored?/:tenantId/contents/*", (request, response, next) => {
        const contentP = getContent(
            request.params.tenantId,
            request.get("Authorization"),
            request.params[0],
            request.query.ref);
        utils.handleResponse(
            contentP,
            response,
            false);
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHeader } from "@microsoft/fluid-gitresources";
import { Router } from "express";
import nconf from "nconf";
import utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function getHeader(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean,
    ): Promise<IHeader> {
        throw new Error("Not implemented");
    }

    async function getTree(
        tenantId: string,
        authorization: string,
        sha: string,
        useCache: boolean,
    ): Promise<any> {
        throw new Error("Not implemented");
    }

    router.get(
        "/repos/:ignored?/:tenantId/headers/:sha",
        (request, response) => {
            const useCache = !("disableCache" in request.query);
            const headerP = getHeader(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha,
                useCache);
            utils.handleResponse(headerP, response, useCache);
        });

    router.get(
        "/repos/:ignored?/:tenantId/tree/:sha",
        (request, response) => {
            const useCache = !("disableCache" in request.query);
            const headerP = getTree(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha,
                useCache);
            utils.handleResponse(headerP, response, useCache);
        });

    return router;
}

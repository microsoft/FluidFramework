/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@prague/gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function createTree(
        tenantId: string,
        authorization: string,
        params: git.ICreateTreeParams,
    ): Promise<git.ITree> {
        throw new Error("Not implemented");
    }

    async function getTree(
        tenantId: string,
        authorization: string,
        sha: string,
        recursive: boolean,
        useCache: boolean,
    ): Promise<git.ITree> {
        throw new Error("Not implemented");
    }

    router.post(
        "/repos/:ignored?/:tenantId/git/trees",
        (request, response) => {
            const treeP = createTree(request.params.tenantId, request.get("Authorization"), request.body);
            utils.handleResponse(
                treeP,
                response,
                false,
                201);
        });

    router.get(
        "/repos/:ignored?/:tenantId/git/trees/:sha",
        (request, response) => {
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

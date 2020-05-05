/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@microsoft/fluid-gitresources";
import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function createTag(
        tenantId: string,
        authorization: string,
        params: git.ICreateTagParams,
    ): Promise<git.ITag> {
        throw new Error("Not implemented");
    }

    async function getTag(tenantId: string, authorization: string, tag: string): Promise<git.ITag> {
        throw new Error("Not implemented");
    }

    router.post(
        "/repos/:ignored?/:tenantId/git/tags",
        (request, response) => {
            const tagP = createTag(request.params.tenantId, request.get("Authorization"), request.body);
            utils.handleResponse(
                tagP,
                response,
                false,
                201);
        });

    router.get(
        "/repos/:ignored?/:tenantId/git/tags/*",
        (request, response) => {
            const tagP = getTag(request.params.tenantId, request.get("Authorization"), request.params[0]);
            utils.handleResponse(
                tagP,
                response,
                false);
        });

    return router;
}

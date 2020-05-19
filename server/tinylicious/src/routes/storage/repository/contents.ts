/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function getContent(
        tenantId: string,
        authorization: string,
        path: string,
        ref: string,
    ): Promise<any> {
        throw new Error("Not implemented");
    }

    router.get(
        "/repos/:ignored?/:tenantId/contents/*",
        (request, response) => {
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

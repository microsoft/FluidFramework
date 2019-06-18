/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import { Provider } from "nconf";
import { ChainDb } from "../chainDb";

export function create(config: Provider, db: ChainDb): Router {
    const router: Router = Router();

    router.get("/:tenantId?/:id", (request, response, next) => {
        const status = db.hasDocument(request.params.id) ? 200 : 400;
        response.status(status).json(null);
    });

    return router;
}

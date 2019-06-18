/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import * as moniker from "moniker";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(request, response, docId: string, config: any) {
    response.render(
        "maps",
        {
            endpoints: JSON.stringify(config.tenantInfo.endpoints),
            id: docId,
            partials: defaultPartials,
            tenantId: config.tenantInfo.id,
            title: docId,
            token: request.query.token,
            workerConfig: JSON.stringify(config.worker),
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/", (request, response, next) => {
        response.redirect(`/maps/${moniker.choose()}`);
    });

    router.get("/:id", ensureAuthenticated(config.tenantInfo.id, config.tenantInfo.secretKey),
               (request, response, next) => {
        request.query.token = response.locals.token;
        renderView(request, response, request.params.id, config);
    });

    return router;
}

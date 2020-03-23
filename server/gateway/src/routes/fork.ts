/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import { IAlfred } from "../interfaces";

export function create(alfred: IAlfred, ensureLoggedIn: any): Router {
    const router: Router = Router();

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId/:id", ensureLoggedIn(), (request, response) => {
        const tenantId = request.params.tenantId;
        const documentId = request.params.id;

        const forkP = alfred.createFork(tenantId, documentId);
        forkP.then(
            (fork) => {
                response.redirect(`/loader/${encodeURIComponent(tenantId)}/${encodeURIComponent(fork)}`);
            },
            (error) => {
                response.status(400).json(safeStringify(error));
            });
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import safeStringify from "json-stringify-safe";
import { IAlfred } from "../interfaces";
import { getUserDetails } from "../utils";
import { defaultPartials } from "./partials";

export function create(alfred: IAlfred, ensureLoggedIn: any): Router {
    const router: Router = Router();

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId/:id", ensureLoggedIn(), (request, response) => {
        const tenantId = request.params.tenantId;
        const documentId = request.params.id;

        const versionsP = alfred.getVersions(tenantId, documentId, 10);
        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        documentId,
                        partials: defaultPartials,
                        pathPostfix: "",
                        tenantId,
                        type: "loader",
                        user: getUserDetails(request),
                        versions: JSON.stringify(versions),
                    });
            },
            (error) => {
                response.status(400).json(safeStringify(error));
            });
    });

    return router;
}

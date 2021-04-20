/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorage } from "@fluidframework/server-services-core";
import { Router } from "express";
import { getParam } from "../../utils";

export function create(storage: IDocumentStorage): Router {
    const router: Router = Router();

    router.get("/:tenantId?/:id", (request, response) => {
        const documentP = storage.getDocument(
            getParam(request.params, "tenantId"),
            getParam(request.params, "id"));
        documentP.then(
            (document) => {
                response.status(200).json(document);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Creates a new document with initial summary.
     */
    router.post("/:tenantId", (request, response, next) => {
        // Tenant and document
        const tenantId = getParam(request.params, "tenantId");
        const id = request.body.id;

        // Summary information
        const summary = request.body.summary;

        // Protocol state
        const sequenceNumber = request.body.sequenceNumber;
        const values = request.body.values;

        const createP = storage.createDocument(
            tenantId,
            id,
            summary,
            sequenceNumber,
            1,
            values);

        createP.then(
            () => {
                response.status(201).json(id);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}

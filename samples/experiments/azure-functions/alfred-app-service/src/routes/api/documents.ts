/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAlfredTenant, IDocumentStorage } from "@prague/services-core";
import { Router } from "express";

export function create(storage: IDocumentStorage): Router {
    const router: Router = Router();

    router.get("/:tenantId/:id", (request, response) => {
        const documentP = storage.getDocument(
            request.params.tenantId,
            request.params.id);
        documentP.then(
            (document) => {
                response.status(200).json(document);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Lists all forks of the specified document
     */
    router.get("/:tenantId/:id/forks", (request, response) => {
        const forksP = storage.getForks(
            request.params.tenantId,
            request.params.id);
        forksP.then(
            (forks) => {
                response.status(200).json(forks);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Creates a new fork for the specified document
     */
    router.post("/:tenantId/:id/forks", (request, response) => {
        const forkIdP = storage.createFork(
            request.params.tenantId,
            request.params.id);
        forkIdP.then(
            (forkId) => {
                response.status(201).json(forkId);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorage, IExperimentalDocumentStorage } from "@microsoft/fluid-server-services-core";
import { Router } from "express";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import { getParam } from "../../utils";

export function create(storage: IDocumentStorage, appTenants: IAlfredTenant[]): Router {

    const router: Router = Router();

    router.get("/:tenantId?/:id", (request, response, next) => {
        const documentP = storage.getDocument(
            getParam(request.params, "tenantId") || appTenants[0].id,
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
     * Lists all forks of the specified document
     */
    router.get("/:tenantId?/:id/forks", (request, response, next) => {
        const forksP = storage.getForks(
            getParam(request.params, "tenantId") || appTenants[0].id,
            getParam(request.params, "id"));
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
    router.post("/:tenantId?/:id/forks", (request, response, next) => {
        const forkIdP = storage.createFork(
            getParam(request.params, "tenantId") || appTenants[0].id,
            getParam(request.params, "id"));
        forkIdP.then(
            (forkId) => {
                response.status(201).json(forkId);
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

        const expDocumentStorage = (storage as IExperimentalDocumentStorage);
        if (!expDocumentStorage.isExperimentalDocumentStorage) {
            response.status(400).json("No experimental features!!");
        }
        const createP = expDocumentStorage.createDocument(
            tenantId,
            id,
            summary,
            sequenceNumber,
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

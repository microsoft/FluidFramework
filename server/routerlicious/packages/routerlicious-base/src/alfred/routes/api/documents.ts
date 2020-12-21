/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorage, IThrottler } from "@fluidframework/server-services-core";
import { throttle, IThrottleMiddlewareOptions } from "@fluidframework/server-services-utils";
import { Router } from "express";
import winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { getParam, Constants } from "../../../utils";

export function create(
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    throttler: IThrottler): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
        throttleIdSuffix: Constants.throttleIdSuffix,
    };

    router.get("/:tenantId?/:id", throttle(throttler, winston, commonThrottleOptions), (request, response, next) => {
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
     * Creates a new document with initial summary.
     */
    router.post("/:tenantId", throttle(throttler, winston, commonThrottleOptions), (request, response, next) => {
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

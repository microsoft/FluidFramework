/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorage, IThrottler, ITenantManager } from "@fluidframework/server-services-core";
import {
    verifyStorageToken,
    throttle,
    IThrottleMiddlewareOptions,
    getParam,
} from "@fluidframework/server-services-utils";
import { Router } from "express";
import winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { Provider } from "nconf";
import { v4 as uuid } from "uuid";
import { Constants, handleResponse } from "../../../utils";

export function create(
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    throttler: IThrottler,
    config: Provider,
    tenantManager: ITenantManager): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
        throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
    };

    router.get(
        "/:tenantId/:id",
        verifyStorageToken(tenantManager, config),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
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
    router.post(
        "/:tenantId",
        verifyStorageToken(tenantManager, config, {
            requireDocumentId: true,
            ensureSingleUseToken: true,
            singleUseTokenCache: {}, // TODO: get a redis instance down here... new Redis config?
        }),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            // Tenant and document
            const tenantId = getParam(request.params, "tenantId");
            const id = request.body.id as string || uuid();

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

            handleResponse(createP.then(() => id), response, undefined, 201);
        });

    return router;
}

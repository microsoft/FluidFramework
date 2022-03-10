/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import {
    IDocumentStorage,
    IThrottler,
    ITenantManager,
    ICache,
    MongoManager,
} from "@fluidframework/server-services-core";
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
import { Constants, convertUrls, handleResponse, getSession } from "../../../utils";

export function create(
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    throttler: IThrottler,
    singleUseTokenCache: ICache,
    config: Provider,
    tenantManager: ITenantManager,
    globalDbMongoManager?: MongoManager): Router {
    const router: Router = Router();

    // Whether to enforce server-generated document ids in create doc flow
    const enforceServerGeneratedDocumentId: boolean = config.get("alfred:enforceServerGeneratedDocumentId") ?? false;

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
                    if (!document || document.scheduledDeletionTime) {
                        response.status(404);
                    }
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
            requireDocumentId: false,
            ensureSingleUseToken: true,
            singleUseTokenCache,
        }),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            // Tenant and document
            const tenantId = getParam(request.params, "tenantId");
            // If enforcing server generated document id, ignore id parameter
            const id = enforceServerGeneratedDocumentId
                ? uuid()
                : request.body.id as string || uuid();

            // Summary information
            const summary = request.body.summary;

            const [ordererUrl, historianUrl] = convertUrls(request.headers.host);
            const documentSession: IDocumentSession = {
                documentId: id,
                hasSessionLocationChanged: false,
                session:
                {
                    ordererUrl,
                    historianUrl,
                    isSessionAlive: false,
                },
            };

            // Protocol state
            const sequenceNumber = request.body.sequenceNumber;
            const values = request.body.values;

            const createP = storage.createDocument(
                tenantId,
                id,
                summary,
                sequenceNumber,
                1,
                crypto.randomBytes(4).toString("hex"),
                ordererUrl,
                historianUrl,
                values);

            handleResponse(createP.then(() => documentSession), response, undefined, 201);
        });

    /**
     * Get the session information.
     */
    router.get(
    "/:tenantId/session/:id",
    verifyStorageToken(tenantManager, config),
    throttle(throttler, winston, commonThrottleOptions),
    async (request, response, next) => {
        const documentId = getParam(request.params, "id");
        const tenantId = getParam(request.params, "tenantId");
        const [ordererUrl, historianUrl] = convertUrls(request.headers.host);
        const documentSessionP = getSession(globalDbMongoManager, documentId, ordererUrl, historianUrl, tenantId);
        handleResponse(documentSessionP, response, undefined, 201);
    });
    return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import {
    IDocument,
    IDocumentStorage,
    IThrottler,
    ITenantManager,
    ICache,
    ICollection,
} from "@fluidframework/server-services-core";
import {
    verifyStorageToken,
    getCreationToken,
    throttle,
    IThrottleMiddlewareOptions,
    getParam,
} from "@fluidframework/server-services-utils";
import { Router } from "express";
import winston from "winston";
import { IAlfredTenant, ISession } from "@fluidframework/server-services-client";
import { Provider } from "nconf";
import { v4 as uuid } from "uuid";
import { Constants, handleResponse, getSession } from "../../../utils";

export function create(
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    throttler: IThrottler,
    singleUseTokenCache: ICache,
    config: Provider,
    tenantManager: ITenantManager,
    documentsCollection: ICollection<IDocument>): Router {
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

            // Session information
            const ordererUrl = config.get("worker:serverUrl");
            const historianUrl = config.get("worker:blobStorageUrl");
            const session: ISession = {
                ordererUrl,
                historianUrl,
                isSessionAlive: false,
            };

            // Protocol state
            const { sequenceNumber, values, generateToken = false } = request.body;

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

            // Generate creation token given a jwt from header
            const enableDiscovery: boolean = request.body.enableDiscovery ?? false;
            const authorizationHeader = request.header("Authorization");
            const tokenRegex = /Basic (.+)/;
            const tokenMatch = tokenRegex.exec(authorizationHeader);
            const token = tokenMatch[1];

            const tenantKeyP = tenantManager.getKey(tenantId);

            handleResponse(Promise.all([createP, tenantKeyP]).then(([_, key]) => {
                // @TODO: Modify it to return an object only, it returns string for back-compat.
                if (enableDiscovery && generateToken) {
                    return {
                        id,
                        session,
                        token: getCreationToken(token, key, id),
                    };
                }
                else if (enableDiscovery && !generateToken) {
                    return {
                        id,
                        session,
                    };
                }
                else if (!enableDiscovery && generateToken) {
                    return {
                        id,
                        token: getCreationToken(token, key, id),
                    };
                }
                return id;
            }), response, undefined, 201);
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
            const ordererUrl = config.get("worker:serverUrl");
            const historianUrl = config.get("worker:blobStorageUrl");
            const session = getSession(ordererUrl, historianUrl, tenantId, documentId, documentsCollection);
            handleResponse(session, response, undefined, 200);
        });
    return router;
}

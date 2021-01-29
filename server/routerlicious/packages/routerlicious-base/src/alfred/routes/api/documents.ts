/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorage, IThrottler, ITenantManager } from "@fluidframework/server-services-core";
import { validateTokenClaims, throttle, IThrottleMiddlewareOptions } from "@fluidframework/server-services-utils";
import { Request, Router } from "express";
import winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { Provider } from "nconf";
import { getParam, Constants } from "../../../utils";

// eslint-disable-next-line max-len
async function verifyToken(request: Request, tenantManager: ITenantManager, maxTokenLifetimeSec: number, isTokenExpiryEnabled: boolean): Promise<void> {
    const authorizationHeader = request.header("Authorization");
    const regex = /Basic (.+)/;
    const tokenMatch = regex.exec(authorizationHeader);
    if (!tokenMatch || !tokenMatch[1]) {
        return Promise.reject(new Error("Missing access token"));
    }
    const token = tokenMatch[1];
    const tenantId = getParam(request.params, "tenantId");
    const documentId = request.body.id;
    const claims = validateTokenClaims(token, documentId, tenantId, maxTokenLifetimeSec, isTokenExpiryEnabled);
    if (!claims) {
        return Promise.reject(new Error("Invalid access token"));
    }
    return tenantManager.verifyToken(claims.tenantId, token);
}

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

    router.get("/:tenantId?/:id", throttle(throttler, winston, commonThrottleOptions), (request, response, next) => {
        const maxTokenLifetimeSec = config.get("auth:maxTokenLifetimeSec") as number;
        const isTokenExpiryEnabled = config.get("auth:enableTokenExpiration") as boolean;
        verifyToken(request, tenantManager, maxTokenLifetimeSec, isTokenExpiryEnabled).then(
            () => {
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
            },
            (error) => {
                winston.error("Invalid access token.");
                response.status(401).json(error);
            });
    });

    /**
     * Creates a new document with initial summary.
     */
    router.post("/:tenantId", throttle(throttler, winston, commonThrottleOptions), (request, response, next) => {
        const maxTokenLifetimeSec = config.get("auth:maxTokenLifetimeSec") as number;
        const isTokenExpiryEnabled = config.get("auth:enableTokenExpiration") as boolean;

        verifyToken(request, tenantManager, maxTokenLifetimeSec, isTokenExpiryEnabled).then(
            () => {
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
            },
            (error) => {
                winston.error("Invalid access token.");
                response.status(401).json(error);
            });
    });

    return router;
}

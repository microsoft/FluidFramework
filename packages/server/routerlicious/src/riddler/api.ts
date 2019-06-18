/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager } from "@prague/services-core";
import { Response, Router } from "express";
import { TenantManager } from "./tenantManager";

export function create(
    collectionName: string,
    mongoManager: MongoManager,
    baseOrderUrl: string,
): Router {
    const router: Router = Router();
    const manager = new TenantManager(mongoManager, collectionName, baseOrderUrl);

    function returnResponse<T>(resultP: Promise<T>, response: Response) {
        resultP.then(
            (result) => response.status(200).json(result),
            (error) => response.status(400).end(error.toString()));
    }

    /**
     * Validates a tenant token. This only confirms that the token was correctly signed by the given tenant.
     * Clients still need to verify the claims.
     */
    router.post("/tenants/:id/validate", (request, response) => {
        const validP = manager.validateToken(request.params.id, request.body.token);
        returnResponse(validP, response);
    });

    /**
     * Retrieves details for the given tenant
     */
    router.get("/tenants/:id", (request, response) => {
        const tenantP = manager.getTenant(request.params.id);
        returnResponse(tenantP, response);
    });

    /**
     * Retrieves the api key for the tenant
     */
    router.get("/tenants/:id/key", (request, response) => {
        const tenantP = manager.getTenantKey(request.params.id);
        returnResponse(tenantP, response);
    });

    /**
     * Updates the storage provider for the given tenant
     */
    router.put("/tenants/:id/storage", (request, response) => {
        const storageP = manager.updateStorage(request.params.id, request.body);
        returnResponse(storageP, response);
    });

    /**
     * Updates the orderer for the given tenant
     */
    router.put("/tenants/:id/orderer", (request, response) => {
        const storageP = manager.updateOrderer(request.params.id, request.body);
        returnResponse(storageP, response);
    });

    /**
     * Creates a new tenant
     */
    router.post("/tenants", (request, response) => {
        const tenantP = manager.createTenant();
        returnResponse(tenantP, response);
    });

    return router;
}

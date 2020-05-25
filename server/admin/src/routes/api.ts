/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import { Response, Router } from "express";
import { Provider } from "nconf";
import { IKeyValue, IKeyValueWrapper, ITenantInput } from "../definitions";
import { TenantManager } from "../tenantManager";

export function create(
    config: Provider,
    mongoManager: core.MongoManager,
    ensureLoggedIn: any,
    tenantManager: TenantManager,
    cache: IKeyValueWrapper): Router {
    const router: Router = Router();

    function returnResponse<T>(resultP: Promise<T>, response: Response) {
        resultP.then(
            (result) => response.status(200).json(result),
            (error) => response.status(400).end(error.toString()));
    }

    /**
     * Creates a new tenant
     */
    router.post("/tenants", ensureLoggedIn(), (request, response) => {
        const oid = request.user ? request.user.oid : "local";
        const tenantInput = request.body as ITenantInput;
        const tenantP = tenantManager.addTenant(oid, tenantInput);
        returnResponse(tenantP, response);
    });

    /**
     * Deletes an existing tenant
     */
    router.delete("/tenants/:id", ensureLoggedIn(), (request, response) => {
        const tenantP = tenantManager.deleteTenant(request.params.id);
        returnResponse(tenantP, response);
    });

    /**
     * Creates a new Key-Value
     */
    router.post("/keyValues", ensureLoggedIn(), (request, response) => {
        const keyValueInput = request.body as IKeyValue;
        const addP = cache.addKeyValue(keyValueInput);
        returnResponse(addP, response);
    });

    /**
     * Deletes an existing Key-Value
     */
    router.delete("/keyValues/*", ensureLoggedIn(), (request, response) => {
        const key = request.params[0] as string;
        const delP = cache.removeKeyValue(key);
        returnResponse(delP, response);
    });

    return router;
}

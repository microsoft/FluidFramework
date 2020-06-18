/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import * as passport from "passport";
import * as winston from "winston";
import { IData, IKeyValueWrapper, ITenant, IKeyValue } from "../definitions";
import { TenantManager } from "../tenantManager";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    mongoManager: core.MongoManager,
    ensureLoggedIn: any,
    tenantManager: TenantManager,
    cache: IKeyValueWrapper): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const oid = request.user ? request.user.oid : "local";
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const user = request.user ? request.user : { displayName: "local" };
        const tenantsP = tenantManager.getTenantsforUser(oid);
        // Return empty result if the key-value document was not loaded properly.
        const keyValuesP = cache.getKeyValues().then((keyValues) => {
            return keyValues;
        }, () => {
            return [];
        });

        const tuple: [Promise<ITenant[]>, Promise<any | IKeyValue[]>] = [tenantsP, keyValuesP];

        Promise.all(tuple).then(([tenants, keyValues]) => {
            const data: IData = {
                keyValues,
                tenants,
            };
            response.render(
                "admin",
                {
                    data: JSON.stringify(data),
                    partials: defaultPartials,
                    title: "Admin Portal",
                    user: JSON.stringify(user),
                },
            );
        }, (error) => {
            winston.error(error);
            response.status(500).json(error);
        });
    });

    /**
     * App login routes
     */
    router.get(
        "/login",
        passport.authenticate("openidconnect", {
            scope: [
                "profile",
                "email",
            ],
        },
        ));

    router.get(
        "/auth/callback",
        passport.authenticate("openidconnect", {
            failureRedirect: "/login",
            successReturnToOrRedirect: "/",
        },
        ));

    return router;
}

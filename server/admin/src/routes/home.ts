/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@prague/services-core";
import { Router } from "express";
import { Provider } from "nconf";
import * as passport from "passport";
import * as winston from "winston";
import { IData, IKeyValue } from "../definitions";
import { KeyValueManager } from "../keyValueManager";
import { TenantManager } from "../tenantManager";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    mongoManager: core.MongoManager,
    ensureLoggedIn: any,
    tenantManager: TenantManager,
    keyValueManager: KeyValueManager,
): Router {

    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        const tenantsP = tenantManager.getTenantsforUser(request.user.oid);
        // Return empty result if the key-value document was not loaded properly.
        const keyValuesP = keyValueManager.getKeyValues().then((values) => {
            return values;
        }, () => {
            return [] as IKeyValue[];
        });
        Promise.all([tenantsP, keyValuesP]).then(([tenants, keyValues]) => {
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
                    user: JSON.stringify(request.user),
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

import * as utils from "@prague/services-utils";
import { Router } from "express";
import { Provider } from "nconf";
import * as passport from "passport";
import * as winston from "winston";
import { TenantManager } from "../tenantManager";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    mongoManager: utils.MongoManager,
    ensureLoggedIn: any,
    manager: TenantManager,
): Router {

    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        const tenantsP = manager.getTenantsforUser(request.user.oid);
        tenantsP.then(
            (tenants) => {
                response.render(
                    "admin",
                    {
                        data: JSON.stringify(tenants),
                        partials: defaultPartials,
                        title: "Admin Portal",
                        user: JSON.stringify(request.user),
                    },
                );
            },
            (error) => {
                winston.error(error);
                response.status(500).json(error);
            },
        );
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

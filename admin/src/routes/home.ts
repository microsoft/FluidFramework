import * as utils from "@prague/routerlicious/dist/utils";
import { Router } from "express";
import { Provider } from "nconf";
import * as passport from "passport";
import * as winston from "winston";
import { defaultPartials } from "./partials";
import { TenantManager } from "./tenantManager";

export function create(config: Provider, mongoManager: utils.MongoManager, ensureLoggedIn: any): Router {

    const router: Router = Router();
    const manager = new TenantManager(
        mongoManager,
        config.get("mongo:collectionNames:users"),
        config.get("mongo:collectionNames:orgs"),
        config.get("mongo:collectionNames:tenants"),
        config.get("app:riddlerUrl"),
        config.get("app:gitUrl"),
        config.get("app:cobaltUrl"));

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        const tenantsP = manager.getTenantsforUser(request.user.toString());
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

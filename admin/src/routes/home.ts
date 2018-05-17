import * as utils from "@prague/routerlicious/dist/utils";
import { Router } from "express";
import { Provider } from "nconf";
import * as passport from "passport";
import * as winston from "winston";
import { defaultPartials } from "./partials";
import { TenantManager } from "./tenantManager";

export function create(
    config: Provider,
    mongoManager: utils.MongoManager,
    userCollectionName: string,
    orgCollectionName: string,
    tenantCollectionName: string): Router {

    const router: Router = Router();
    const manager = new TenantManager(
        mongoManager,
        userCollectionName,
        orgCollectionName,
        tenantCollectionName,
        config.get("app:riddlerUrl"),
        config.get("app:gitUrl"),
        config.get("app:cobaltUrl"));

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", (request, response, next) => {
        if (request.user === undefined) {
            return response.redirect("/login");
        }

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

    router.get(
        "/login",
        passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
        (request, response) => {
            response.redirect("/");
        });

    router.get(
        "/logout",
        (request, response) => {
            request.logout();
            response.redirect("/");
        });

    router.get(
        "/auth/openid",
        passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
        (request, response) => {
            response.redirect("/");
        });

    router.get(
        "/auth/openid/return",
        passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
        (request, response) => {
            response.redirect("/");
        });

    router.post(
        "/auth/openid/return",
        passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
        (request, response) => {
            response.redirect("/");
        });

    return router;
}

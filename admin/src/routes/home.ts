import { Router } from "express";
import * as passport from "passport";
import * as winston from "winston";
import * as dbService from "../db";
import * as data from "./dataUtil";
import { defaultPartials } from "./partials";

export function create(config: any, mongoManager: dbService.MongoManager, collectionName: string): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", (request, response, next) => {
        if (request.user === undefined) {
            response.render("home", { partials: defaultPartials, title: "Login" });
        } else {
            const tenantsP = data.getTenants(mongoManager, collectionName);

            tenantsP.then(
                (tenants) => {
                    response.render(
                        "admin",
                        {
                            data: JSON.stringify({
                                tenants: {
                                    list: tenants,
                                },
                            }),
                            endpoints: JSON.stringify(config.endpoints),
                            partials: defaultPartials,
                            tenantConfigs: JSON.stringify(config.tenantConfig),
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
        }
    });

    router.get("/login",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        response.redirect("/");
    });

    router.get("/logout", (request, response) => {
      request.logout();
      response.redirect("/");
    });

    router.get("/auth/openid",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        response.redirect("/");
    });

    router.get("/auth/openid/return",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        response.redirect("/");
    });

    router.post("/auth/openid/return",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        response.redirect("/");
    });

    return router;
}

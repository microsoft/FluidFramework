import { Router } from "express";
import * as passport from "passport";
import * as winston from "winston";
import { defaultPartials } from "./partials";

export function create(config: any): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", (request, response, next) => {
        response.render("home", { partials: defaultPartials, title: "Apps" });
    });

    router.get("/login",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        winston.info("Login is successful!");
        response.redirect("/");
    });

    router.get("/logout", (request, response) => {
      request.logout();
      response.redirect("/");
    });

    router.get("/auth/openid",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        winston.info("Authentication was called in the Sample");
        response.redirect("/");
    });

    router.get("/auth/openid/return",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        winston.info("Get: We received a return from AzureAD.");
        response.redirect("/");
    });

    router.post("/auth/openid/return",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        winston.info("Post: We received a return from AzureAD.");
        response.redirect("/");
    });

    return router;
}

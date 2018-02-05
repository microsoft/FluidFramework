import { Router } from "express";
import * as passport from "passport";
import { clearToken } from "./authCheker";
import { defaultPartials } from "./partials";

export function create(config: any): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", (request, response, next) => {
        response.render("home", { partials: defaultPartials, title: "Prague Apps", user: request.user });
    });

    router.get("/login",
    passport.authenticate("azuread-openidconnect", { failureRedirect: "/login" }),
    (request, response) => {
        response.redirect("/");
    });

    router.get("/logout", (request, response) => {
     // Clears the token first.
      clearToken(request.user.upn);
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

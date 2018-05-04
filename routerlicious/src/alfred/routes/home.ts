import { Router } from "express";
import { Provider } from "nconf";
import * as passport from "passport";
import { defaultPartials } from "./partials";

let ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn;

export function create(config: Provider): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        response.render("home", { partials: defaultPartials, title: "Routerlicious" });
    });

    router.get("/login",
    passport.authenticate("openidconnect", {
        scope: [
            "profile",
            "email",
        ],
    }));

    router.get(
        "/auth/callback",
        passport.authenticate("openidconnect", {
            failureRedirect: "/login",
        }),
        (request, response, next) => {
            response.redirect("/");
        });

    return router;
}

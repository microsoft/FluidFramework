import { Router } from "express";
import { Provider } from "nconf";
import * as passport from "passport";
import { defaultPartials } from "./partials";

export function create(config: Provider, ensureLoggedIn: any): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        response.render("home", { partials: defaultPartials, title: "Routerlicious" });
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

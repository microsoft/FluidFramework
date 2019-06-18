/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
        "/login_spo",
        passport.authenticate("openidconnect", {
            scope: [
                "profile",
                "email",
                "offline_access",
                "https://microsoft-my.sharepoint.com/AllSites.Write",
            ],
        },
    ));

    router.get(
        "/login_spo-df",
        passport.authenticate("openidconnect", {
            scope: [
                "profile",
                "email",
                "offline_access",
                "https://microsoft-my.sharepoint-df.com/AllSites.Write",
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

    router.get(
        "/login/local",
        (request, response) => {
            response.render("login", { partials: defaultPartials, title: "Routerlicious" });
        });

    router.post(
        "/login/local",
        passport.authenticate("local", { failureRedirect: "/login/local" }),
        (request, response) => {
            response.redirect("/");
        });

    return router;
}

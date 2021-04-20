/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import { Provider } from "nconf";
import passport from "passport";
import { getUserDetails } from "../utils";
import { defaultPartials } from "./partials";

const microsoftScopes = {
    scope: [
        "profile",
        "email",
        "openid",
        "Calendars.ReadWrite",
        "Mail.ReadWrite",
        "Mail.Send",
        "Tasks.ReadWrite",
        "User.Read",
    ],
};

export function create(config: Provider, ensureLoggedIn: any): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        response.render("home", {
            partials: defaultPartials,
            title: "Routerlicious",
            user: getUserDetails(request),
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
        }),
    );

    router.get(
        "/login_spo",
        passport.authenticate("openidconnect", {
            scope: [
                "offline_access",
                "https://microsoft-my.sharepoint.com/AllSites.Write",
            ],
        }),
    );

    router.get(
        "/login_spo-df",
        passport.authenticate("openidconnect", {
            scope: [
                "offline_access",
                "https://microsoft-my.sharepoint-df.com/AllSites.Write",
            ],
        }),
    );

    router.get(
        "/login_spo-shared",
        passport.authenticate("openidconnect", {
            scope: [
                "offline_access",
                "https://microsoft.sharepoint.com/AllSites.Write",
            ],
        }),
    );

    router.get(
        "/login_pushsrv",
        passport.authenticate("openidconnect", {
            scope: [
                "offline_access",
                "https://pushchannel.1drv.ms/PushChannel.ReadWrite.All",
            ],
        }),
    );

    router.get(
        "/connect/microsoft",
        ensureLoggedIn(),
        passport.authenticate("msa", microsoftScopes));

    router.get(
        "/connect/microsoft/callback",
        ensureLoggedIn(),
        passport.authenticate("msa", {
            failureRedirect: "/",
            successRedirect: "/",
        }));

    router.get(
        "/auth/callback",
        passport.authenticate("openidconnect", {
            failureRedirect: "/login",
            successReturnToOrRedirect: "/",
        }),
    );

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

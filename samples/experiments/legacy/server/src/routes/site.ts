/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as express from "express";
import * as _ from "lodash";
import { IUser } from "../accounts";
import { defaultPartials } from "./partials";

// simpler code path and module not setup for import
// tslint:disable-next-line:no-var-requires
let ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn;
let router = express.Router();

// GET home page
router.get("/", (request, response, next) => {
    response.render(
        "index",
        {
            partials: defaultPartials,
            title: "ProNet",
            user: request.user,
        });
});

// User profile
router.get("/profile", ensureLoggedIn(), (request, response) => {
    // TODO need to verify that the user is actually logged in

    let user = <IUser> request.user;

    // Create base view model that we will update as we find more information
    let providers = {
        facebook: { name: "Facebook", connected: false, connect: "/connect/facebook" },
        google: { name: "Google", connected: false, connect: "/connect/google" },
        linkedin: { name: "LinkedIn", connected: false, connect: "/connect/linkedin" },
        microsoft: { name: "Microsoft", connected: false, connect: "/connect/microsoft" },
    };

    // Update based on the connected accounts
    for (let account of user.accounts) {
        providers[account.provider].connected = true;
        providers[account.provider].disconnect = `/connect/remove/${account.id}`;
    }

    let viewModel = _.keys(providers).map((key) => ({ provider: key, details: providers[key] }));

    response.render(
        "profile",
        {
            partials: defaultPartials,
            user: request.user,
            viewModel,
        });
});

// Login
router.get("/login", (request, response) => {
    response.render("login",
        {
            partials: defaultPartials,
        });
});

// Logout
router.get("/logout", (request, response) => {
    request.logout();
    response.redirect("/");
});

export = router;

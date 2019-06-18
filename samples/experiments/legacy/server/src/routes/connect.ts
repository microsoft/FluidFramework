/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as express from "express";
import * as passport from "passport";
import * as accounts from "../accounts";
import * as authOptions from "./authOptions";

// simpler code path and module not setup for import
// tslint:disable-next-line:no-var-requires
let ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn;

let router = express.Router();

// TODO these all probably should be POST calls - but simpler in the UI for now to leave as GETs

router.get("/google", ensureLoggedIn(), passport.authorize("google", authOptions.google));

router.get("/facebook", ensureLoggedIn(), passport.authorize("facebook", authOptions.facebook));

router.get("/microsoft", ensureLoggedIn(), passport.authorize("openidconnect", authOptions.microsoft));

router.get("/linkedin", ensureLoggedIn(), passport.authorize("linkedin", authOptions.linkedin));

router.get("/remove/:id", ensureLoggedIn(), (request, response) => {
    let id = request.params.id;

    // TODO on error return some kind of error message, etc... and/or turn this into AJAX calls
    accounts.unlinkAccount(request.user, id).then(
        () => response.redirect("/profile"),
        (error) => response.redirect("/profile"));
});

export = router;

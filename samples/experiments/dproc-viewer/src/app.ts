/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios from "axios";
import * as bodyParser from "body-parser";
import * as compression from "compression";
import { ensureLoggedIn } from "connect-ensure-login";
import * as express from "express";
import { Express } from "express";
import OAuthServer = require("express-oauth-server");
import * as expressSession from "express-session";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import * as morgan from "morgan";
import { Provider } from "nconf";
import * as passport from "passport";
import * as passportOpenIdConnect from "passport-openidconnect";
import * as path from "path";
import * as favicon from "serve-favicon";
import * as expiry from "static-expiry";
import * as uuid from "uuid/v4";
import { Model } from "./model";

function generateToken(documentId: string, tenantId: string, secret: string, name: string): string {
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: name,
            },
        },
        secret);
    return token;
}

export function create(config: Provider) {
    const orderer = config.get("orderer");
    const storage = config.get("storage");
    const tenantId = config.get("tenantId");
    const tenantSecret = config.get("secret");
    const npm = config.get("npm:url");

    const auth = {
        password: config.get("npm:password"),
        username: config.get("npm:username"),
    };
    // fetch the list of available packages
    const packagesP = Axios.get(
        "https://packages.wu2.prague.office-int.com/-/verdaccio//search/@chaincode",
        { auth })
        .then((search) => {
            return search.data
                .filter((value) => value.name.indexOf("@chaincode") === 0)
                .sort((a, b) => a.name.localeCompare(b.name));
        });

    const microsoftStrategy = new passportOpenIdConnect.Strategy({
            authorizationURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
            callbackURL: config.get("login:callbackURL"),
            clientID: config.get("login:clientId"),
            clientSecret: config.get("login:secret"),
            issuer: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0",
            passReqToCallback: true,
            skipUserProfile: true,
            tokenURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
        },
        (req, iss, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
            if (jwtClaims.tid !== "72f988bf-86f1-41af-91ab-2d7cd011db47") {
                return done(new Error("Tenant not supported"));
            } else {
                return done(null, jwtClaims);
            }
        },
    );

    passport.use(microsoftStrategy);
    passport.serializeUser((user: any, done) => {
        console.log(JSON.stringify(user, null, 2));
        done(null, user);
    });
    passport.deserializeUser((user: any, done) => {
        done(null, user);
    });

    // Express app configuration
    const app: Express = express();

    const model = new Model(config.get("clients")) as any;
    const oauth = new OAuthServer({ model });

    // view engine setup
    app.set("views", path.join(__dirname, "../views"));
    app.set("view engine", "hjs");

    app.use(compression());
    app.use(favicon(path.join(__dirname, "../public", "favicon.ico")));
    app.use(morgan("tiny"));
    app.use(expressSession({ secret: uuid() }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(passport.initialize());
    app.use(passport.session());

    app.use("/public", expiry(app, { dir: path.join(__dirname, "../public") }));
    // handlebars version of furl
    app.locals.hfurl = () => (value: string) => app.locals.furl(value);
    app.use("/public", express.static(path.join(__dirname, "../public")));

    app.get(
        "/login",
        passport.authenticate("openidconnect", {
            scope: [
                "profile",
                "email",
            ],
        },
    ));

    app.get(
        "/auth/callback",
        passport.authenticate("openidconnect", {
            failureRedirect: "/login",
            successReturnToOrRedirect: "/",
        },
    ));

    // oauth server routes
    const options = {
        authenticateHandler: {
            handle: (request, response) => {
                return request.user;
            },
        },
    };

    app.post("/auth/oauth/token", oauth.token());
    app.get("/auth/oauth/auth", ensureLoggedIn(), oauth.authorize(options));
    app.post("/auth/oauth/auth", ensureLoggedIn(), oauth.authorize(options));

    app.get("/", ensureLoggedIn(), (request, response, next) => {
        packagesP.then(
            (packages) => {
                response.render(
                    "home",
                    {
                        packages,
                        packagesString: JSON.stringify(packages, null, 2),
                        partials: {
                            layout: "layout",
                        },
                        title: "Home",
                    },
                );
            },
            (error) => {
                next(error);
            });
    });

    app.get("/meta", ensureLoggedIn(), (request, response) => {
        response.render(
            "meta",
            {
                partials: {
                    layout: "layout",
                },
                title: "Meta",
            });
    });

    app.post("/create", ensureLoggedIn(), (request, response) => {
        const documentId = moniker.choose();
        const token = generateToken(documentId, tenantId, tenantSecret, request.user.name);

        response.render(
            "generate",
            {
                chaincode: request.body.chaincode,
                documentId,
                npm,
                orderer,
                partials: {
                    layout: "layout",
                },
                storage,
                tenantId,
                title: documentId,
                token,
            });
    });

    app.get("/:id", ensureLoggedIn(), (request, response) => {
        const token = generateToken(request.params.id, tenantId, tenantSecret, request.user.name);

        response.render(
            "loader",
            {
                documentId: request.params.id,
                npm,
                orderer,
                partials: {
                    layout: "layout",
                },
                storage,
                tenantId,
                title: request.params.id,
                token,
            });
    });

    // catch 404 and forward to error handler
    app.use((req, res, next) => {
        const err = new Error("Not Found");
        (err as any).status = 404;
        next(err);
    });

    // error handlers

    // development error handler
    // will print stacktrace
    if (app.get("env") === "development") {
        app.use((err, req, res, next) => {
            res.status(err.status || 500);
            res.render("error", {
                error: err,
                message: err.message,
                partials: {
                    layout: "layout",
                },
            });
        });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.render("error", {
            error: {},
            message: err.message,
            partials: {
                layout: "layout",
            },
        });
    });

    return app;
}

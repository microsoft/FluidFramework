/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import _ from "lodash";
import { getRandomName, IAlfredTenant } from "@fluidframework/server-services-client";
import { ICache, MongoManager } from "@fluidframework/server-services-core";
import bodyParser from "body-parser";
import compression from "compression";
import connectRedis from "connect-redis";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import expressSession from "express-session";
import morgan from "morgan";
import { Provider } from "nconf";
import passport from "passport";
import passportJWT from "passport-jwt";
import passportLocal from "passport-local";
import passportOpenIdConnect from "passport-openidconnect";
import redis from "redis";
import favicon from "serve-favicon";
import expiry from "static-expiry";
import { v4 } from "uuid";
import winston from "winston";
import dotenv from "dotenv";

import { AccountManager } from "./accounts";
import { saveSpoTokens } from "./gatewayOdspUtils";
import { IAlfred } from "./interfaces";
import * as gatewayRoutes from "./routes";

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const split = require("split");
// Base endpoint to expose static files at
const staticFilesEndpoint = "/public";

dotenv.config();

// Helper function to translate from a static files URL to the path to find the file
// relative to the static assets directory
export function translateStaticUrl(
    url: string,
    cache: { [key: string]: string },
    furl: (val: string) => string,
    production: boolean): string {
    const local = url.substring(staticFilesEndpoint.length);
    if (!(local in cache)) {
        const parsedPath = path.parse(local);
        parsedPath.name = `${parsedPath.name}.min`;
        // base and root are marked undefined to placate the TS definitions and because we want the format to
        // resolve with dir/ext/name. Base and root if defined will override.
        const minified = path.format({
            base: undefined,
            dir: parsedPath.dir,
            ext: parsedPath.ext,
            name: parsedPath.name,
            root: undefined,
        });

        // Cache the result and then update local
        cache[local] =
            production && fs.existsSync(path.join(__dirname, "../public", minified))
                ? minified
                : local;
    }

    return staticFilesEndpoint + furl(cache[local]);
}

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

async function refreshUser(user: any, accountManager: AccountManager) {
    const accounts = await accountManager.getAccounts(user.sub);
    user.accounts = accounts;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
}

function connectAccount(
    user: any,
    accountManager: AccountManager,
    provider: string,
    providerId: string,
    accessToken: string,
    expires: number,
    refreshToken: string,
    done: (error: any, user?: any) => void) {
    const expiration = accountManager.getTokenExpiration(expires);
    const userP = accountManager
        .linkAccount(provider, providerId, accessToken, expiration, refreshToken, user.sub)
        .then(async () => refreshUser(user, accountManager));

    userP.then(
        (newUser) => {
            // eslint-disable-next-line no-null/no-null
            done(null, newUser);
        },
        (error) => {
            console.log(error);
            // eslint-disable-next-line no-null/no-null
            done(error, null);
        });
}

export function create(
    config: Provider,
    alfred: IAlfred,
    tenants: IAlfredTenant[],
    cache: ICache,
    mongoManager: MongoManager,
    accountsCollectionName: string,
) {
    // Create a redis session store.
    let sessionStore;
    if (config.get("gateway:sessionStore") === "memory") {
        sessionStore = new expressSession.MemoryStore();
    } else {
        const redisStore = connectRedis(expressSession);
        const redisHost = config.get("redis:host");
        const redisPort = config.get("redis:port");
        const redisPass = config.get("redis:pass");
        const options: redis.ClientOpts = { auth_pass: redisPass };
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (config.get("redis:tls")) {
            options.tls = {
                servername: redisHost,
            };
        }
        const redisClient = redis.createClient(redisPort, redisHost, options);
        sessionStore = new redisStore({ client: redisClient });
    }

    const accountManager = new AccountManager(mongoManager, accountsCollectionName);

    // Maximum REST request size
    const requestSize = config.get("gateway:restJsonSize");

    // Static cache to help map from full to minified files
    const staticMinCache: { [key: string]: string } = {};
    const microsoftConfiguration = config.get("login:microsoft");
    passport.use(
        new passportOpenIdConnect.Strategy(
            {
                authorizationURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
                callbackURL: "/auth/callback",
                clientID: _.isEmpty(microsoftConfiguration.clientId)
                    ? process.env.MICROSOFT_CONFIGURATION_CLIENT_ID : microsoftConfiguration.clientId,
                clientSecret: _.isEmpty(microsoftConfiguration.secret)
                    ? process.env.MICROSOFT_CONFIGURATION_CLIENT_SECRET : microsoftConfiguration.secret,
                issuer: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0",
                passReqToCallback: true,
                skipUserProfile: true,
                tokenURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
            },
            (req, iss, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
                saveSpoTokens(req, params, accessToken, refreshToken);
                const userData = { ...jwtClaims, accessToken };
                connectAccount(
                    userData,
                    accountManager,
                    "microsoft",
                    sub,
                    accessToken,
                    params.expires_in,
                    refreshToken,
                    done);
            },
        ),
    );

    const msaConfiguration = config.get("login:linkedAccounts:msa");
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (msaConfiguration) {
        passport.use(
            "msa",
            new passportOpenIdConnect.Strategy(
                {
                    // I believe consumers should make sure we pull the right thing
                    authorizationURL: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
                    callbackURL: "/connect/microsoft/callback",
                    clientID: _.isEmpty(msaConfiguration.clientId)
                        ? process.env.MSA_CONFIGURATION_CLIENT_ID : msaConfiguration.clientId,
                    clientSecret: _.isEmpty(msaConfiguration.secret)
                        ? process.env.MSA_CONFIGURATION_CLIENT_SECRET : msaConfiguration.secret,
                    issuer: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                    passReqToCallback: true,
                    skipUserProfile: true,
                    tokenURL: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                },
                (req, iss, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
                    connectAccount(
                        req.user,
                        accountManager,
                        "msa",
                        sub,
                        accessToken,
                        params.expires_in,
                        refreshToken,
                        done);
                },
            ),
        );
    }

    const opts = {
        jwtFromRequest: passportJWT.ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: config.get("gateway:key"),
    };
    passport.use(new passportJWT.Strategy(opts, (payload, done) => {
        // eslint-disable-next-line no-null/no-null
        return done(null, payload);
    }));

    // Get local accounts - used primarily for automated testing
    const localAccounts = config.get("login:accounts") as { username: string; password: string }[];
    passport.use(new passportLocal.Strategy(
        (username, password, done) => {
            for (const localAccount of localAccounts) {
                // tslint:disable-next-line:possible-timing-attack
                if (localAccount.username === username && localAccount.password === password) {
                    const name = getRandomName(" ", true);
                    return done(
                        // eslint-disable-next-line no-null/no-null
                        null,
                        {
                            displayName: name,
                            name,
                            sub: localAccount.username,
                        });
                }
            }

            // eslint-disable-next-line no-null/no-null
            return done(null, false);
        },
    ));

    // Right now we simply pass through the entire stored user object to the session storage for that user.
    // Ideally we should just serialize the oid and retrieve user info back from DB on deserialization.
    passport.serializeUser((user: any, done) => {
        // eslint-disable-next-line no-null/no-null
        done(null, user);
    });

    passport.deserializeUser((user: any, done) => {
        // eslint-disable-next-line no-null/no-null
        done(null, user);
    });

    // Express app configuration
    const app: express.Express = express();

    // Running behind iisnode
    app.set("trust proxy", 1);

    // view engine setup
    app.set("views", path.join(__dirname, "../views"));
    app.set("view engine", "hjs");

    app.use(compression());
    app.use(favicon(path.join(__dirname, "../public", "favicon.ico")));
    // TODO we probably want to switch morgan to use the common format in prod
    app.use(morgan(config.get("logger:morganFormat"), { stream }));

    app.use(cookieParser());
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));
    app.use(expressSession({
        resave: true,
        saveUninitialized: true,
        secret: config.get("express:session:secret"),
        store: sessionStore,
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    app.use(staticFilesEndpoint, expiry(app, { dir: path.join(__dirname, "../public") }));
    app.locals.hfurl = () => (value: string) => {
        return translateStaticUrl(
            value,
            staticMinCache,
            app.locals.furl,
            app.get("env") === "production");
    };
    app.use(staticFilesEndpoint, cors(), express.static(path.join(__dirname, "../public")));

    // The below is to check to make sure the session is available (redis could have gone down for instance) and if
    // not return an error
    app.use((request, response, next) => {
        if (request.session === undefined) {
            return next(new Error("Session not available"));
        } else {
            next();     // otherwise continue
        }
    });

    function getFingerprintUrl(requestUrl: string) {
        const local = requestUrl.substring(staticFilesEndpoint.length);
        if (!(local in staticMinCache)) {
            return requestUrl;
        } else {
            return `${staticFilesEndpoint}${app.locals.furl(staticMinCache[local])}`;
        }
    }

    // bind routes
    const routes = gatewayRoutes.create(config, cache, alfred, tenants, getFingerprintUrl);

    app.use((request, response, next) => {
        if (request.session === undefined) {
            return next("Session is required");
        }

        if (request.session.guest === undefined) {
            const name = getRandomName(" ", true);
            request.session.guest = {
                displayName: name,
                sub: `guest-${v4()}`,
                name,
            };
        }

        next();
    });

    app.use(routes.api);
    app.use("/loader", routes.loader);
    app.use("/loaderFrs", routes.loaderFrs);
    app.use("/loaderFramed", routes.loaderFramed);
    app.use("/versions", routes.versions);
    app.use("/token", routes.token);
    app.use(routes.home);

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
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            res.status(err.status || 500);
            res.render("error", {
                error: err,
                message: err.message,
            });
        });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use((err, req, res, next) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        res.status(err.status || 500);
        res.render("error", {
            error: {},
            message: err.message,
        });
    });

    return app;
}

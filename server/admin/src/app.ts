/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AssertionError } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as core from "@fluidframework/server-services-core";
import * as bodyParser from "body-parser";
import * as compression from "compression";
import * as connectRedis from "connect-redis";
import * as cookieParser from "cookie-parser";
import * as cors from "cors";
import * as express from "express";
import { Express } from "express";
import * as expressSession from "express-session";
import * as morgan from "morgan";
import { Provider } from "nconf";
import * as passport from "passport";
import * as passportOpenIdConnect from "passport-openidconnect";
import * as redis from "redis";
import * as favicon from "serve-favicon";
import split = require("split");
import * as expiry from "static-expiry";
import * as winston from "winston";
import * as appRoutes from "./routes";
import { TenantManager } from "./tenantManager";

// Base endpoint to expose static files at
const staticFilesEndpoint = "/public";

// Helper function to translate from a static files URL to the path to find the file
// relative to the static assets directory
function translateStaticUrl(
    url: string,
    cache: { [key: string]: string },
    furl: (name: string) => string,
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

function handleAsserionError(error: Error) {
    winston.info(`Handling error ${JSON.stringify(error)}`);
    if (error instanceof AssertionError) {
        winston.error(JSON.stringify(error));
    } else {
        throw error;
    }
}

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(config: Provider, mongoManager: core.MongoManager) {
    // We are loading a Fluid document that might lead to assertion errors.
    // Handling this so that the whole process is not terminated.
    winston.info(`Attaching error handlers`);
    process.on("uncaughtException", handleAsserionError);
    process.on("unhandledRejection", handleAsserionError);

    const tenantManager = new TenantManager(
        mongoManager,
        config.get("mongo:collectionNames:users"),
        config.get("mongo:collectionNames:orgs"),
        config.get("mongo:collectionNames:tenants"),
        config.get("app:riddlerUrl"),
        config.get("app:gitUrl"),
        config.get("app:cobaltUrl"),
        config.get("app:historianUrl"),
        config.get("app:alfredUrl"),
        config.get("app:jarvisUrl"));

    // Create a redis session store.
    let sessionStore: any;
    if (config.get("login:enabled")) {
        const redisStore = connectRedis(expressSession);
        const redisHost = config.get("redis:host");
        const redisPort = config.get("redis:port");
        const redisPass = config.get("redis:pass");
        const options: redis.ClientOpts  = { auth_pass: redisPass };
        if (config.get("redis:tls")) {
            options.tls = {
                servername: redisHost,
            };
        }
        const redisClient = redis.createClient(redisPort, redisHost, options);
        sessionStore = new redisStore({ client: redisClient });
    } else {
        sessionStore = new expressSession.MemoryStore();
    }

    const staticMinCache: { [key: string]: string } = {};

    const microsoftConfiguration = config.get("login:microsoft");
    passport.use(
        new passportOpenIdConnect.Strategy({
            authorizationURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
            callbackURL: "/auth/callback",
            clientID: microsoftConfiguration.clientId,
            clientSecret: microsoftConfiguration.secret,
            issuer: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0",
            passReqToCallback: true,
            skipUserProfile: true,
            tokenURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
        },
        (req, iss, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
            return done(null, jwtClaims);
        },
        ),
    );

    // Right now we simply pass through the entire stored user object to the session storage for that user.
    // Ideally we should just serialize the oid and retrieve user info back from DB on deserialization.
    passport.serializeUser((user: any, done) => {
        done(null, user);
    });

    passport.deserializeUser((user: any, done) => {
        done(null, user);
    });

    // Express app configuration
    const app: Express = express();

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
    app.use(bodyParser.json({ limit: "50mb" }));
    app.use(bodyParser.urlencoded({ limit: "50mb", extended: false }));
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
        if (!request.session) {
            return next(new Error("Session not available"));
        } else {
            next();     // otherwise continue
        }
    });

    const routes = appRoutes.create(config, mongoManager, tenantManager);
    app.use("/api", routes.api);
    app.use("/", routes.home);

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
        });
    });

    return app;
}

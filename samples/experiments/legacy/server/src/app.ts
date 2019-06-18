/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as bodyParser from "body-parser";
import * as connectRedis from "connect-redis";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import * as expressSession from "express-session";
import * as moment from "moment";
import * as logger from "morgan";
import * as nconf from "nconf";
import * as passport from "passport";
import * as path from "path";
import * as redis from "redis";
import * as request from "request";
import * as favicon from "serve-favicon";
import * as accounts from "./accounts";
import * as authRoute from "./routes/auth";
import * as browserRoute from "./routes/browser";
import * as calendarsRouter from "./routes/calendars";
import * as canvasRoute from "./routes/canvas";
import * as connectRoute from "./routes/connect";
import * as documentsRoute from "./routes/documents";
import * as excelRoute from "./routes/excel";
import * as knowledgeRoute from "./routes/knowledge";
import * as loaderRoute from "./routes/loader";
import * as siteRoute from "./routes/site";
import * as usersRoute from "./routes/users";
import * as viewsRoute from "./routes/views";

// modules not setup for import style inclusion
// tslint:disable:no-var-requires
let facebook = require("passport-facebook");
let google = require("passport-google-oauth");
let linkedin = require("passport-linkedin");
let passportOpenIdConnect = require("passport-openidconnect");
// tslint:enable:no-var-requires

// tslint:disable:no-console

// initialize session store - if redis is configured we will use it - otherwise will default to the memory store
let sessionStore;
if (nconf.get("redis")) {
    console.log("Using redis for session storage");
    let RedisStore = connectRedis(expressSession);

    // Apply custom options if specified
    let options: any = null;
    if (nconf.get("redis:tls")) {
        options = {
            auth_pass: nconf.get("redis:pass"),
        };

        options.tls = {
            servername: nconf.get("redis:host"),
        };

        // Azure seems to lose our Redis client for SSL connections - we ping it to keep it alive.
        setInterval(() => {
            redisClient.ping((error, result) => {
                if (error) {
                    console.log("Ping error: " + error);
                }
            });
        }, 60 * 1000);
    }

    // Create the client
    let redisClient = redis.createClient(
        nconf.get("redis:port"),
        nconf.get("redis:host"),
        options);

    sessionStore = new RedisStore({ client: redisClient });
} else {
    console.log("Using memory for session storage");
    sessionStore = new expressSession.MemoryStore();
}

// Express app configuration
let app = express();

// Running behind iisnode
app.set("trust proxy", 1);

// view engine setup
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "hjs");

// Right now we simply pass through the entire stored user object to the session storage for that user
passport.serializeUser((user: accounts.IUser, done) => {
    done(null, user.user.id);
});

passport.deserializeUser((id: any, done) => {
    accounts.getUser(id).then((user) => done(null, user), (error) => done(error, null));
});

function completeAuthentication(
    provider: string,
    providerId: string,
    accessToken: string,
    expires: number,
    refreshToken: string,
    details: accounts.IUserDetails,
    done: (error: any, user?: any) => void) {

    let expiration = accounts.getTokenExpiration(expires);
    let userP = accounts.createOrGetUser(provider, providerId, accessToken, expiration, refreshToken, details);
    userP.then(
        (user) => {
            done(null, user);
        },
        (error) => {
            done(error, null);
        });
}

function connectAccount(
    provider: string,
    providerId: string,
    accessToken: string,
    expires: number,
    refreshToken: string,
    userId: string,
    done: (error: any, user?: any) => void) {

    let expiration = accounts.getTokenExpiration(expires);
    let linkP = accounts.linkAccount(provider, providerId, accessToken, expiration, refreshToken, userId);
    linkP.then(
        (user) => {
            done(null, user);
        },
        (error) => {
            console.log(error);
            done(error, null);
        });
}

let linkedinConfiguration = nconf.get("login:linkedin");
passport.use(
    new linkedin({
        callbackURL: "/auth/linkedin/callback",
        consumerKey: linkedinConfiguration.clientId,
        consumerSecret: linkedinConfiguration.secret,
        passReqToCallback: true,
        profileFields: ["id", "first-name", "last-name", "email-address", "headline"],
    },
        (req, accessToken, refreshToken, params, profile, done) => {
            if (!req.user) {
                completeAuthentication(
                    "linkedin",
                    profile.id,
                    accessToken,
                    params.expires_in,
                    refreshToken,
                    {
                        displayName: profile.displayName,
                        name: profile.name,
                    },
                    done);
            } else {
                connectAccount(
                    "linkedin",
                    profile.id,
                    accessToken,
                    params.expires_in,
                    refreshToken,
                    req.user.user.id,
                    done);
            }
        }));

let facebookConfiguration = nconf.get("login:facebook");
passport.use(
    new facebook({
        callbackURL: "/auth/facebook/callback",
        clientID: facebookConfiguration.clientId,
        clientSecret: facebookConfiguration.secret,
        passReqToCallback: true,
        profileFields: ["id", "displayName", "email", "name", "gender"],
    },
        (req, accessToken, refreshToken, params, profile, done) => {
            if (!req.user) {
                completeAuthentication(
                    "facebook",
                    profile.id,
                    accessToken,
                    params.expires_in,
                    refreshToken,
                    {
                        displayName: profile.displayName,
                        name: profile.name,
                    },
                    done);
            } else {
                connectAccount(
                    "facebook",
                    profile.id,
                    accessToken,
                    params.expires_in,
                    refreshToken,
                    req.user.user.id,
                    done);
            }
        }));

let googleConfiguration = nconf.get("login:google");
passport.use(
    new google.OAuth2Strategy({
        callbackURL: "/auth/google/callback",
        clientID: googleConfiguration.clientId,
        clientSecret: googleConfiguration.secret,
        passReqToCallback: true,
    },
        (req, accessToken, refreshToken, params, profile, done) => {
            if (!req.user) {
                completeAuthentication(
                    "google",
                    profile.id,
                    accessToken,
                    params.expires_in,
                    refreshToken,
                    {
                        displayName: profile.displayName,
                        name: profile.name,
                    },
                    done);
            } else {
                connectAccount(
                    "google",
                    profile.id,
                    accessToken,
                    params.expires_in,
                    refreshToken,
                    req.user.user.id,
                    done);
            }
        }));

let microsoftConfiguration = nconf.get("login:microsoft");
passport.use(
    new passportOpenIdConnect.Strategy({
            authorizationURL: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            callbackURL: "/auth/microsoft/callback",
            clientID: microsoftConfiguration.clientId,
            clientSecret: microsoftConfiguration.secret,
            passReqToCallback: true,
            skipUserProfile: true,
            tokenURL: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        },
        (req, iss, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
            console.log(params);
            if (!req.user) {
                // use request to load in the user profile
                request.get(
                    "https://graph.microsoft.com/v1.0/me",
                    { auth: { bearer: accessToken }, json: true },
                    (error, response, body) => {
                        console.log("User profile information");
                        console.log(JSON.stringify(body, null, 2));

                        completeAuthentication(
                            "microsoft",
                            sub,
                            accessToken,
                            params.expires_in,
                            refreshToken,
                            {
                                displayName: body.displayName,
                                name: {
                                    familyName: body.surname,
                                    givenName: body.givenName,
                                },
                            },
                            done);
                    });
            } else {
                connectAccount("microsoft", sub, accessToken, params.expires_in, refreshToken, req.user.user.id, done);
            }
        }));

// uncomment after placing your favicon in /public
// app.use(favicon(path.join(__dirname, "public", "favicon.ico")));
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(expressSession({
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
    resave: false,
    saveUninitialized: false,
    secret: "bAq0XuQWqoAZzaAkQT5EXPCHBkeIEZqi",
    store: sessionStore,
}));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/node_modules", express.static(path.join(__dirname, "../node_modules")));
// The below is to check to make sure the session is available (redis could have gone down for instance) and if
// not return an error
app.use((request, response, next) => {
    if (!request.session) {
        return next(new Error("Session not available"));
    } else {
        next();     // otherwise continue
    }
});
app.use(passport.initialize());
app.use(passport.session());

// enable CORS headers for all routes for now
app.use((request, response, next) => {
    response.header("Access-Control-Allow-Origin", "*");
    response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});
app.use("/", siteRoute);
app.use("/auth", authRoute);
app.use("/connect", connectRoute);
app.use("/users", usersRoute);
app.use("/knowledge", knowledgeRoute);
app.use("/documents", documentsRoute);
app.use("/loader", loaderRoute);
app.use("/excel", excelRoute);
app.use("/canvas", canvasRoute);
app.use("/calendars", calendarsRouter);
app.use("/browser", browserRoute);
app.use("/views", viewsRoute);

// catch 404 and forward to error handler
app.use((req, res, next) => {
    let err = new Error("Not Found");
    (<any> err).status = 404;
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

export default app;

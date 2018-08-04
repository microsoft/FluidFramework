import * as bodyParser from "body-parser";
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

function getNotesToken(user: string, tenantId: string, secret: string, name: string) {
    const token = generateToken(`${user}-notes`, tenantId, secret, name);
    return token;
}

function getNoteToken(user: string, noteId: string, tenantId: string, secret: string, name: string) {
    const token = generateToken(`${user}-notes-${noteId}`, tenantId, secret, name);
    return token;
}

export function create(config: Provider) {
    const routerlicious = config.get("routerlicious");
    const historian = config.get("historian");
    const tenantId = config.get("tenantId");
    const tenantSecret = config.get("tenantSecret");

    const microsoftStrategy = new passportOpenIdConnect.Strategy({
            authorizationURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
            callbackURL: "/auth/callback",
            clientID: config.get("clientId"),
            clientSecret: config.get("secret"),
            issuer: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0",
            passReqToCallback: true,
            skipUserProfile: true,
            tokenURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
        },
        (req, iss, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
            // https://github.com/oauthjs/express-oauth-server/blob/master/examples/postgresql/index.js
            // https://apps.dev.microsoft.com
            // sub is my friend on the claims
            return done(null, jwtClaims);
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

    // TODO put client configs in the JSON config

    const model = new Model(config.get("clients")) as any;
    const oauth = new OAuthServer({ model });

    // view engine setup
    app.set("views", path.join(__dirname, "../../views"));
    app.set("view engine", "hjs");

    app.use(morgan("tiny"));
    app.use(expressSession({ secret: uuid() }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use("/public", express.static(path.join(__dirname, "../../public")));
    app.use("/public/stylesheets", express.static(path.join(__dirname, "../../stylesheets")));

    app.get("/", ensureLoggedIn(), (request, response) => {
        response.render(
            "home",
            {
                partials: {
                    layout: "layout",
                },
                title: "Nota",
            },
        );
    });

    app.get("/notes", ensureLoggedIn(), (request, response) => {
        const user = request.user.sub;
        const name = request.user.name;
        const token = getNotesToken(user, tenantId, tenantSecret, name);

        response.render(
            "webnotes",
            {
                historian,
                partials: {
                    layout: "layout",
                },
                routerlicious,
                tenantId,
                title: "Nota",
                token,
            },
        );
    });

    app.get("/notes/:id", ensureLoggedIn(), (request, response) => {
        const user = request.user.sub;
        const name = request.user.name;
        const token = getNoteToken(user, request.params.id, tenantId, tenantSecret, name);
        const notesToken = getNotesToken(user, tenantId, tenantSecret, name);

        response.render(
            "webnote",
            {
                historian,
                noteId: request.params.id,
                notesToken,
                partials: {
                    layout: "layout",
                },
                routerlicious,
                tenantId,
                title: request.params.id,
                token,
            },
        );
    });

    app.post("/notes", ensureLoggedIn(), (request, response) => {
        const noteId = moniker.choose();
        response.redirect(`/notes/${encodeURIComponent(noteId)}`);
    });

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

    app.post("/api/me/tokens/windows", oauth.authenticate(), (request, response) => {
        const user = response.locals.oauth.token.user.sub;
        const name = response.locals.oauth.token.user.name;
        console.log(`User is ${user}`);
        const token = generateToken(`${user}-windows`, tenantId, tenantSecret, name);
        response.status(200).json(token);
    });

    app.post("/api/me/tokens/notes", oauth.authenticate(), (request, response) => {
        const user = response.locals.oauth.token.user.sub;
        const name = response.locals.oauth.token.user.name;
        const token = getNotesToken(user, tenantId, tenantSecret, name);
        response.status(200).json(token);
    });

    app.post("/api/me/tokens/notes/:id", oauth.authenticate(), (request, response) => {
        const user = response.locals.oauth.token.user.sub;
        const name = response.locals.oauth.token.user.name;
        const token = getNoteToken(user, request.params.id, tenantId, tenantSecret, name);
        response.status(200).json(token);
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

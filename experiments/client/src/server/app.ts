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

function generateToken(documentId: string, tenantId: string, secret: string): string {
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);
    return token;
}

function getNotesToken(user: string, tenantId: string, secret: string) {
    const token = generateToken(`${user}-notes`, tenantId, secret);
    return token;
}

function getNoteToken(user: string, noteId: string, tenantId: string, secret: string) {
    const token = generateToken(`${user}-notes-${noteId}`, tenantId, secret);
    return token;
}

export function create(config: Provider) {
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

    const model = new Model([
        {
            grants: ["authorization_code"],
            id: "dog",
            redirectUris: ["http://localhost:3000/dog", "http://127.0.0.1:8000"],
            secret: "cats",
        }]) as any;
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
        const token = getNotesToken(user, tenantId, tenantSecret);

        response.render(
            "webnotes",
            {
                partials: {
                    layout: "layout",
                },
                title: "Nota",
                token,
            },
        );
    });

    app.get("/notes/:id", ensureLoggedIn(), (request, response) => {
        const user = request.user.sub;
        const token = getNoteToken(user, request.params.id, tenantId, tenantSecret);

        response.render(
            "webnote",
            {
                partials: {
                    layout: "layout",
                },
                title: request.params.id,
                token,
            },
        );
    });

    app.post("/notes", ensureLoggedIn(), (request, response) => {
        const user = request.user.sub;
        const noteId = moniker.choose();
        const notesToken = getNotesToken(user, tenantId, tenantSecret);
        const noteToken = getNoteToken(user, noteId, tenantId, tenantSecret);

        response.render(
            "webnote",
            {
                noteId,
                notesToken,
                partials: {
                    layout: "layout",
                },
                title: request.params.id,
                token: noteToken,
            },
        );
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
                // Whatever you need to do to authorize / retrieve your user from post data here
                return {
                    id: request.user.sub,
                };
            },
        },
    };

    app.post("/auth/oauth/token", oauth.token());
    app.get("/auth/oauth/auth", ensureLoggedIn(), oauth.authorize(options));
    app.post("/auth/oauth/auth", ensureLoggedIn(), oauth.authorize(options));

    const tenantId = config.get("tenantId");
    const tenantSecret = config.get("tenantSecret");
    app.post("/api/me/tokens/windows", oauth.authenticate(), (request, response) => {
        const user = response.locals.oauth.token.user.id;
        console.log(`User is ${user}`);
        const token = generateToken(`${user}-windows`, tenantId, tenantSecret);
        response.status(200).json(token);
    });

    app.post("/api/me/tokens/notes", oauth.authenticate(), (request, response) => {
        const user = response.locals.oauth.token.user.id;
        const token = getNotesToken(user, tenantId, tenantSecret);
        response.status(200).json(token);
    });

    app.post("/api/me/tokens/notes/:id", oauth.authenticate(), (request, response) => {
        const user = response.locals.oauth.token.user.id;
        const token = getNoteToken(user, request.params.id, tenantId, tenantSecret);
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

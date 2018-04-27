import * as bodyParser from "body-parser";
import * as compression from "compression";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import { Express } from "express";
import * as expressSession from "express-session";
import * as fs from "fs";
import * as methodOverride from "method-override";
import * as morgan from "morgan";
import * as passport from "passport";
import * as passportAzure from "passport-azure-ad";
import * as path from "path";
import * as favicon from "serve-favicon";
import split = require("split");
import * as expiry from "static-expiry";
import * as winston from "winston";
import * as appRoutes from "./routes";

interface IUser {
    oid: any;
}

// Base endpoint to expose static files at
const staticFilesEndpoint = "/public";

// Static cache to help map from full to minified files
const staticMinCache: { [key: string]: string } = {};

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

const OIDCStrategy = passportAzure.OIDCStrategy;

passport.serializeUser((user: IUser, done) => {
    done(null, user.oid);
});

passport.deserializeUser((oid: any, done) => {
    findByOid(oid, (err, user: IUser) => {
        done(err, user);
    });
});

// array to hold logged in users
const users: IUser[] = [];

const findByOid = (oid: any, fn) => {
    for (let i = 0, len = users.length; i < len; i++) {
        const user = users[i];
        if (user.oid === oid) {
            return fn(null, user);
        }
    }
    return fn(null, null);
};

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(appConfig: any, aadConfig: any) {
    // Set up passport for AAD auth.
    const creds = aadConfig.creds;
    passport.use(new OIDCStrategy({
        allowHttpForRedirectUrl: creds.allowHttpForRedirectUrl,
        clientID: creds.clientID,
        clientSecret: creds.clientSecret,
        clockSkew: creds.clockSkew,
        cookieEncryptionKeys: creds.cookieEncryptionKeys,
        identityMetadata: creds.identityMetadata,
        isB2C: creds.isB2C,
        issuer: creds.issuer,
        loggingLevel: creds.loggingLevel,
        nonceLifetime: creds.nonceLifetime,
        nonceMaxAmount: creds.nonceMaxAmount,
        passReqToCallback: creds.passReqToCallback,
        redirectUrl: creds.redirectUrl,
        responseMode: creds.responseMode,
        responseType: creds.responseType,
        scope: creds.scope,
        useCookieInsteadOfSession: creds.useCookieInsteadOfSession,
        validateIssuer: creds.validateIssuer,
      },
      (iss, sub, profile, accessToken, refreshToken, done) => {
        if (!profile.oid) {
          return done(new Error("No oid found"), null);
        }
        // asynchronous verification, for effect...
        process.nextTick(() => {
          findByOid(profile.oid, (err, user) => {
            if (err) {
              return done(err);
            }
            if (!user) {
              // "Auto-registration"
              users.push(profile);
              return done(null, profile);
            }
            return done(null, user);
          });
        });
      },
    ));

    // Express app configuration
    const app: Express = express();

    app.use(favicon(path.join(__dirname, "../public", "favicon.ico")));
    // TODO we probably want to switch morgan to use the common format in prod
    app.use(morgan(appConfig.logger.morganFormat, { stream }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));

    // Running behind iisnode
    app.set("trust proxy", 1);

    // View engine setup.
    const viewPath = path.join(__dirname, "../views");
    app.set("views", viewPath);
    app.set("view engine", "hjs");

    app.use(compression());
    app.use(favicon(path.join(__dirname, "../public", "favicon.ico")));

    app.use(staticFilesEndpoint, expiry(app, { dir: path.join(__dirname, "../public") }));
    app.locals.hfurl = () => (value: string) => {
        return translateStaticUrl(
            value,
            staticMinCache,
            app.locals.furl,
            app.get("env") === "production");
    };
    app.use(staticFilesEndpoint, express.static(path.join(__dirname, "../public")));

    app.use(methodOverride());
    app.use(cookieParser());

    // TODO (auth): Use MongoDB
    app.use(expressSession({ secret: "keyboard cat", resave: true, saveUninitialized: false }));

    // Initialize Passport!  Also use passport.session() middleware, to support
    // persistent login sessions (recommended).
    app.use(passport.initialize());
    app.use(passport.session());

    const routes = appRoutes.create(appConfig);
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
            res.json({
                error: err,
                message: err.message,
            });
        });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.json({
            error: {},
            message: err.message,
        });
    });

    return app;
}

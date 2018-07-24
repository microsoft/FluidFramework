import * as bodyParser from "body-parser";
import * as express from "express";
import { Express } from "express";
import * as expressSession from "express-session";
import { Provider } from "nconf";
import * as passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github";
import * as path from "path";
import * as routes from "./routes";

export function create(config: Provider) {
    const gitHubStrategy = new GitHubStrategy(
        {
            callbackURL: "http://localhost:3000/auth/github/callback",
            clientID: config.get("clientId"),
            clientSecret: config.get("clientSecret"),
        },
        (accessToken, refreshToken, profile, cb) => {
            return cb(
                null,
                {
                    accessToken,
                    profile,
                });
        });
    passport.use(gitHubStrategy);
    passport.serializeUser((user: any, done) => {
        done(null, user);
    });
    passport.deserializeUser((user: any, done) => {
        done(null, user);
    });

    // Express app configuration
    const app: Express = express();

    // view engine setup
    app.set("views", path.join(__dirname, "../views"));
    app.set("view engine", "hjs");

    app.use(expressSession({ secret: "bAq0XuQWqoAZzaAkQT5EXPCHBkeIEZqi" }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(passport.initialize());
    app.use(passport.session());

    const appRoutes = routes.create(config);
    app.use("/", appRoutes.auth);
    app.use("/", appRoutes.home);
    app.use("/", appRoutes.webhook);

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

import * as bodyParser from "body-parser";
import * as express from "express";
import { Express } from "express";
import * as morgan from "morgan";
import * as nconf from "nconf";
import split = require("split");
import * as winston from "winston";
import * as routes from "./routes";

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to
 */
const stream = split().on("data", (message) => {
  winston.info(message);
});

export function create(store: nconf.Provider) {
    // Express app configuration
    const app: Express = express();

    // TODO we probably want to switch morgan to use the common format in prod
    app.use(morgan(store.get("logger:morganFormat"), { stream }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));

    const apiRoutes = routes.create(store);
    app.use("/repos", apiRoutes.repos);

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

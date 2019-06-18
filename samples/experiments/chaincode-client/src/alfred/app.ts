/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:ban-types
import * as bodyParser from "body-parser";
import * as express from "express";
import { Express } from "express";
import * as morgan from "morgan";
import { Provider } from "nconf";
import * as path from "path";
import split = require("split");
import * as winston from "winston";
import { ChainDb } from "./chainDb";
import * as alfredRoutes from "./routes";

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(config: Provider, db: ChainDb) {
    // Maximum REST request size
    const requestSize = config.get("alfred:restJsonSize");

    // Express app configuration
    const app: Express = express();

    app.set("views", path.join(__dirname, "../../views"));
    app.set("view engine", "hjs");

    app.use(morgan(config.get("logger:morganFormat"), { stream }));
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    // bind routes
    const routes = alfredRoutes.create(config, db);
    app.use(routes);

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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager } from "@microsoft/fluid-server-services-core";
import bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";
import winston from "winston";
import api from "./api";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const split = require("split");

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(
    collectionName: string,
    mongoManager: MongoManager,
    loggerFormat: string,
    baseOrdererUrl: string,
    defaultHistorianUrl: string,
    defaultInternalHistorianUrl: string,
) {
    // Express app configuration
    const app: express.Express = express();

    // Running behind iisnode
    app.set("trust proxy", 1);

    // View engine setup.
    app.set("view engine", "hjs");

    app.use(morgan(loggerFormat, { stream }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(
        "/api",
        api.create(collectionName, mongoManager, baseOrdererUrl, defaultHistorianUrl, defaultInternalHistorianUrl));

    // Catch 404 and forward to error handler
    app.use((req, res, next) => {
        const err = new Error("Not Found");
        (err as any).status = 404;
        next(err);
    });

    // Error handlers

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

    // Production error handler
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

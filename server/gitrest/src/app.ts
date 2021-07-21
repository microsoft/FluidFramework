/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { json, urlencoded } from "body-parser";
import cors from "cors";
// eslint-disable-next-line import/no-duplicates
import express from "express";
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports, import/no-duplicates
import { Express } from "express";
import morgan from "morgan";
import nconf from "nconf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import split = require("split");
import * as winston from "winston";
import { bindCorrelationId } from "@fluidframework/server-services-utils";
import { IExternalStorageManager } from "./externalStorageManager";
import * as routes from "./routes";
import * as utils from "./utils";

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(
    store: nconf.Provider,
    externalStorageManager: IExternalStorageManager,
) {
    // Express app configuration
    const app: Express = express();

    const loggerFormat = store.get("logger:morganFormat");
    if (loggerFormat === "json") {
        app.use(morgan((tokens, req, res) => {
            const messageMetaData = {
                method: tokens.method(req, res),
                url: tokens.url(req, res),
                status: tokens.status(req, res),
                contentLength: tokens.res(req, res, "content-length"),
                responseTime: tokens["response-time"](req, res),
                serviceName: "historian",
                eventName: "http_requests",
             };
             winston.info("request log generated", { messageMetaData });
             return undefined;
        }, { stream }));
    } else {
        app.use(morgan(loggerFormat, { stream }));
    }

    const requestSize = store.get("requestSizeLimit");
    app.use(json({ limit: requestSize }));
    app.use(urlencoded({ limit: requestSize, extended: false }));

    app.use(bindCorrelationId());

    app.use(cors());
    const repoManager = new utils.RepositoryManager(store.get("storageDir"));
    const apiRoutes = routes.create(store, repoManager, externalStorageManager);
    app.use(apiRoutes.git.blobs);
    app.use(apiRoutes.git.refs);
    app.use(apiRoutes.git.repos);
    app.use(apiRoutes.git.tags);
    app.use(apiRoutes.git.trees);
    app.use(apiRoutes.git.commits);
    app.use(apiRoutes.repository.commits);
    app.use(apiRoutes.repository.contents);

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

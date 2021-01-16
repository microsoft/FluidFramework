/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager, ISecretManager } from "@fluidframework/server-services-core";
import * as bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";
import * as winston from "winston";
import { bindCorrelationId } from "@fluidframework/server-services-utils";
import { getTenantIdFromRequest } from "../utils";
import * as api from "./api";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const split = require("split");

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    if (message !== undefined) {
        winston.info(message);
    }
});

export function create(
    collectionName: string,
    mongoManager: MongoManager,
    loggerFormat: string,
    baseOrdererUrl: string,
    defaultHistorianUrl: string,
    defaultInternalHistorianUrl: string,
    secretManager: ISecretManager,
) {
    // Express app configuration
    const app: express.Express = express();

    // Running behind iisnode
    app.set("trust proxy", 1);

    // View engine setup.
    app.set("view engine", "hjs");
    if (loggerFormat === "json") {
        app.use(morgan((tokens, req, res) => {
            const messageMetaData = {
                method: tokens.method(req, res),
                url: tokens.url(req, res),
                status: tokens.status(req, res),
                contentLength: tokens.res(req, res, "content-length"),
                responseTime: tokens["response-time"](req, res),
                tenantId: getTenantIdFromRequest(req.params),
                serviceName: "riddler",
                eventName: "http_requests",
            };
            winston.info("request log generated", { messageMetaData });
            return undefined;
        }));
    } else {
        app.use(morgan(loggerFormat, { stream }));
    }
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));

    app.use(bindCorrelationId());

    app.use(
        "/api",
        api.create(
            collectionName,
            mongoManager,
            baseOrdererUrl,
            defaultHistorianUrl,
            defaultInternalHistorianUrl,
            secretManager));

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

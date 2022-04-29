/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager, ISecretManager } from "@fluidframework/server-services-core";
import { logRequestMetric, Lumberjack } from "@fluidframework/server-services-telemetry";
import * as bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";
import * as winston from "winston";
import { bindCorrelationId } from "@fluidframework/server-services-utils";
import { catch404, getTenantIdFromRequest, handleError } from "../utils";
import * as api from "./api";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const split = require("split");

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    if (message !== undefined) {
        winston.info(message);
        Lumberjack.info(message);
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

    if (loggerFormat === "json") {
        app.use(morgan((tokens, req, res) => {
            const messageMetaData = {
                method: tokens.method(req, res),
                pathCategory: `${req.baseUrl}${req.route ? req.route.path : "PATH_UNAVAILABLE"}`,
                url: tokens.url(req, res),
                status: tokens.status(req, res),
                contentLength: tokens.res(req, res, "content-length"),
                responseTime: tokens["response-time"](req, res),
                tenantId: getTenantIdFromRequest(req.params),
                serviceName: "riddler",
                eventName: "http_requests",
            };
            logRequestMetric(messageMetaData);
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
    app.use(catch404());

    // Error handlers

    app.use(handleError(app.get("env") === "development"));

    return app;
}

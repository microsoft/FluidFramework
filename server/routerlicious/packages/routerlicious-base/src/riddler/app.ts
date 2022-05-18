/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager, ISecretManager } from "@fluidframework/server-services-core";
import {
    BaseTelemetryProperties,
    CommonProperties,
    HttpProperties,
    LumberEventName,
    Lumberjack,
} from "@fluidframework/server-services-telemetry";
import * as bodyParser from "body-parser";
import express from "express";
import morgan from "morgan";
import { bindCorrelationId, getCorrelationIdWithHttpFallback } from "@fluidframework/server-services-utils";
import { catch404, getTenantIdFromRequest, handleError } from "../utils";
import * as api from "./api";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const split = require("split");

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    if (message !== undefined) {
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
        app.use((request, response, next): void => {
            const httpMetric = Lumberjack.newLumberMetric(LumberEventName.HttpRequest);
            morgan((tokens, req, res) => {
                const messageMetaData = {
                    [HttpProperties.method]: tokens.method(req, res),
                    [HttpProperties.pathCategory]: `${req.baseUrl}${req.route ? req.route.path : "PATH_UNAVAILABLE"}`,
                    [HttpProperties.url]: tokens.url(req, res),
                    [HttpProperties.status]: tokens.status(req, res),
                    [HttpProperties.contentLength]: tokens.res(req, res, "content-length"),
                    [HttpProperties.responseTime]: tokens["response-time"](req, res),
                    [BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
                    [BaseTelemetryProperties.correlationId]: getCorrelationIdWithHttpFallback(req, res),
                    [CommonProperties.serviceName]: "riddler",
                    [CommonProperties.telemetryGroupName]: "http_requests",
                };
                httpMetric.setProperties(messageMetaData);
                if (messageMetaData.status?.startsWith("2")) {
                    httpMetric.success("Request successful");
                } else {
                    httpMetric.error("Request failed");
                }
                return undefined;
            })(request, response, next);
        });
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

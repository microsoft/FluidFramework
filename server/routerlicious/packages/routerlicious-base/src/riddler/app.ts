/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager, ISecretManager } from "@fluidframework/server-services-core";
import { BaseTelemetryProperties } from "@fluidframework/server-services-telemetry";
import * as bodyParser from "body-parser";
import express from "express";
import {
    alternativeMorganLoggerMiddleware,
    bindCorrelationId,
    jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { catch404, getTenantIdFromRequest, handleError } from "../utils";
import * as api from "./api";

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
        app.use(
            jsonMorganLoggerMiddleware(
                "riddler",
                (tokens, req, res) => {
                    return {
                        [BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
                    };
                }));
    } else {
        app.use(alternativeMorganLoggerMiddleware(loggerFormat));
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

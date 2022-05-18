/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import {
    IDocumentStorage,
    IProducer,
    ITenantManager,
    MongoManager,
    IThrottler,
    ICache,
    ICollection,
    IDocument,
} from "@fluidframework/server-services-core";
import { json, urlencoded } from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { Provider } from "nconf";
import * as winston from "winston";
import { DriverVersionHeaderName, IAlfredTenant } from "@fluidframework/server-services-client";
import { bindCorrelationId, getCorrelationIdWithHttpFallback } from "@fluidframework/server-services-utils";
import { RestLessServer } from "@fluidframework/server-services";
import {
    BaseTelemetryProperties,
    CommonProperties,
    HttpProperties,
    LumberEventName,
    Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { catch404, getIdFromRequest, getTenantIdFromRequest, handleError } from "../utils";
import * as alfredRoutes from "./routes";

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
    config: Provider,
    tenantManager: ITenantManager,
    throttler: IThrottler,
    singleUseTokenCache: ICache,
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    operationsDbMongoManager: MongoManager,
    producer: IProducer,
    documentsCollection: ICollection<IDocument>) {
    // Maximum REST request size
    const requestSize = config.get("alfred:restJsonSize");

    // Express app configuration
    const app: express.Express = express();

    // initialize RestLess server translation
    const restLessMiddleware: () => express.RequestHandler = () => {
        const restLessServer = new RestLessServer();
        return (req, res, next) => {
            restLessServer
                .translate(req)
                .then(() => next())
                .catch(next);
        };
    };
    app.use(restLessMiddleware());

    // Running behind iisnode
    app.set("trust proxy", 1);

    app.use(compression());
    const loggerFormat = config.get("logger:morganFormat");
    if (loggerFormat === "json") {
        app.use((request, response, next) => {
            console.log("[DEBUG] Starting app use");
            const httpMetric = Lumberjack.newLumberMetric(LumberEventName.HttpRequest);
            console.log("[DEBUG] Will return morgan");
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return morgan((tokens, req, res) => {
                console.log("[DEBUG] Starting morgan");
                const messageMetaData = {
                    [HttpProperties.method]: tokens.method(req, res),
                    [HttpProperties.pathCategory]: `${req.baseUrl}${req.route ? req.route.path : "PATH_UNAVAILABLE"}`,
                    [HttpProperties.url]: tokens.url(req, res),
                    [HttpProperties.driverVersion]: tokens.req(req, res, DriverVersionHeaderName),
                    [HttpProperties.status]: tokens.status(req, res),
                    [HttpProperties.contentLength]: tokens.res(req, res, "content-length"),
                    [HttpProperties.responseTime]: tokens["response-time"](req, res),
                    [BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
                    [BaseTelemetryProperties.documentId]: getIdFromRequest(req.params),
                    [BaseTelemetryProperties.correlationId]: getCorrelationIdWithHttpFallback(req, res),
                    [CommonProperties.serviceName]: "alfred",
                    [CommonProperties.telemetryGroupName]: "http_requests",
                };
                httpMetric.setProperties(messageMetaData);
                console.log("[DEBUG] Will log within morgan");
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                messageMetaData.status?.startsWith("2") ?
                    httpMetric.success("Request successful") :
                    httpMetric.error("Request failed");
                winston.info("request log generated", { messageMetaData });
                console.log("[DEBUG] Finished logging in morgan");
                return undefined;
            }, { stream })(request, response, next);
        });
    } else {
        app.use(morgan(loggerFormat, { stream }));
    }

    app.use(cookieParser());
    app.use(json({ limit: requestSize }));
    app.use(urlencoded({ limit: requestSize, extended: false }));

    app.use(bindCorrelationId());

    // Bind routes
    const routes = alfredRoutes.create(
        config,
        tenantManager,
        throttler,
        singleUseTokenCache,
        operationsDbMongoManager,
        storage,
        producer,
        appTenants,
        documentsCollection);

    app.use("/public", cors(), express.static(path.join(__dirname, "../../public")));
    app.use(routes.api);

    // Catch 404 and forward to error handler
    app.use(catch404());

    // Error handlers

    app.use(handleError());

    return app;
}

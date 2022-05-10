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
import { bindCorrelationId } from "@fluidframework/server-services-utils";
import { RestLessServer } from "@fluidframework/server-services";
import { logRequestMetric, Lumberjack } from "@fluidframework/server-services-telemetry";
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
        app.use(morgan((tokens, req, res) => {
            const messageMetaData = {
                method: tokens.method(req, res),
                pathCategory: `${req.baseUrl}${req.route ? req.route.path : "PATH_UNAVAILABLE"}`,
                url: tokens.url(req, res),
                driverVersion: tokens.req(req, res, DriverVersionHeaderName),
                status: tokens.status(req, res),
                contentLength: tokens.res(req, res, "content-length"),
                durationInMs: tokens["response-time"](req, res),
                tenantId: getTenantIdFromRequest(req.params),
                documentId: getIdFromRequest(req.params),
                serviceName: "alfred",
                eventName: "http_requests",
             };
             logRequestMetric(messageMetaData);
             winston.info("request log generated", { messageMetaData });
             return undefined;
        }, { stream }));
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

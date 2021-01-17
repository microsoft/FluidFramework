/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import {
    IDocumentStorage,
    IProducer,
    ITenantManager,
    MongoManager,
    IThrottler,
} from "@fluidframework/server-services-core";
import * as bodyParser from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import safeStringify from "json-stringify-safe";
import morgan from "morgan";
import { Provider } from "nconf";
import * as winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { bindCorrelationId } from "@fluidframework/server-services-utils";
import { getTenantIdFromRequest } from "../utils";
import * as alfredRoutes from "./routes";

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
    config: Provider,
    tenantManager: ITenantManager,
    throttler: IThrottler,
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    mongoManager: MongoManager,
    producer: IProducer) {
    // Maximum REST request size
    const requestSize = config.get("alfred:restJsonSize");

    // Express app configuration
    const app: express.Express = express();

    // Running behind iisnode
    app.set("trust proxy", 1);

    app.use(compression());
    const loggerFormat = config.get("logger:morganFormat");
    if (loggerFormat === "json") {
        app.use(morgan((tokens, req, res) => {
            const messageMetaData = {
                method: tokens.method(req, res),
                url: tokens.url(req, res),
                status: tokens.status(req, res),
                contentLength: tokens.res(req, res, "content-length"),
                responseTime: tokens["response-time"](req, res),
                tenantId: getTenantIdFromRequest(req.params),
                serviceName: "alfred",
                eventName: "http_requests",
             };
             winston.info("request log generated", { messageMetaData });
             return undefined;
        }, { stream }));
    } else {
        app.use(morgan(loggerFormat, { stream }));
    }

    app.use(cookieParser());
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    app.use(bindCorrelationId());

    // Bind routes
    const routes = alfredRoutes.create(
        config,
        tenantManager,
        throttler,
        mongoManager,
        storage,
        producer,
        appTenants);

    app.use("/public", cors(), express.static(path.join(__dirname, "../../public")));
    app.use(routes.api);

    // Catch 404 and forward to error handler
    app.use((req, res, next) => {
        const err = new Error("Not Found");
        (err as any).status = 404;
        next(err);
    });

    // Error handlers

    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.json({ error: safeStringify(err), message: err.message });
    });

    return app;
}

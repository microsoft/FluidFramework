/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IThrottler } from "@fluidframework/server-services-core";
import { json, urlencoded } from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import * as nconf from "nconf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import split = require("split");
import * as winston from "winston";
import { bindCorrelationId } from "@fluidframework/server-services-utils";
import { logRequestMetric, Lumberjack } from "@fluidframework/server-services-telemetry";
import { RestLessServer } from "@fluidframework/server-services-shared";
import * as routes from "./routes";
import { ICache, ITenantService } from "./services";
import { getDocumentIdFromRequest, getTenantIdFromRequest } from "./utils";

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to
 */
const stream = split().on("data", (message) => {
    winston.info(message);
    Lumberjack.info(message);
});

export function create(
    config: nconf.Provider,
    tenantService: ITenantService,
    throttler: IThrottler,
    cache?: ICache,
    asyncLocalStorage?: AsyncLocalStorage<string>) {
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

    const loggerFormat = config.get("logger:morganFormat");
    if (loggerFormat === "json") {
        app.use(morgan((tokens, req, res) => {
            const tenantId = getTenantIdFromRequest(req.params);
            const messageMetaData = {
                method: tokens.method(req, res),
                pathCategory: `${req.baseUrl}${req.route ? req.route.path : "PATH_UNAVAILABLE"}`,
                // TODO: replace "x-driver-version" with DriverVersionHeaderName from services-client
                driverVersion: tokens.req(req, res, "x-driver-version"),
                url: tokens.url(req, res),
                status: tokens.status(req, res),
                contentLength: tokens.res(req, res, "content-length"),
                responseTime: tokens["response-time"](req, res),
                tenantId,
                documentId: getDocumentIdFromRequest(tenantId, req.get("Authorization")),
                serviceName: "historian",
                eventName: "http_requests",
             };
             winston.info("request log generated", { messageMetaData });
             logRequestMetric(messageMetaData);
             return undefined;
        }, { stream }));
    } else {
        app.use(morgan(loggerFormat, { stream }));
    }

    const requestSize = config.get("requestSizeLimit");
    app.use(json({ limit: requestSize }));
    app.use(urlencoded({ limit: requestSize, extended: false }));

    app.use(compression());
    app.use(cors());
    app.use(bindCorrelationId(asyncLocalStorage));

    const apiRoutes = routes.create(config, tenantService, throttler, cache, asyncLocalStorage);
    app.use(apiRoutes.git.blobs);
    app.use(apiRoutes.git.refs);
    app.use(apiRoutes.git.tags);
    app.use(apiRoutes.git.trees);
    app.use(apiRoutes.git.commits);
    app.use(apiRoutes.repository.commits);
    app.use(apiRoutes.repository.contents);
    app.use(apiRoutes.repository.headers);
    app.use(apiRoutes.summaries);

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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IThrottler } from "@fluidframework/server-services-core";
import * as bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import * as nconf from "nconf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import split = require("split");
import * as winston from "winston";
import { bindCorrelationId } from "@fluidframework/server-services-utils";
import * as routes from "./routes";
import { ICache, ITenantService } from "./services";

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(
    config: nconf.Provider,
    tenantService: ITenantService,
    cache: ICache,
    throttler: IThrottler,
    asyncLocalStorage: AsyncLocalStorage<string>) {
    // Express app configuration
    const app: express.Express = express();

    // TODO we probably want to switch morgan to use the common format in prod
    app.use(morgan(config.get("logger:morganFormat"), { stream }));

    const requestSize = config.get("requestSizeLimit");
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    app.use(compression());
    app.use(cors());
    app.use(bindCorrelationId(asyncLocalStorage));

    const apiRoutes = routes.create(config, tenantService, cache, throttler, asyncLocalStorage);
    app.use(apiRoutes.git.blobs);
    app.use(apiRoutes.git.refs);
    app.use(apiRoutes.git.tags);
    app.use(apiRoutes.git.trees);
    app.use(apiRoutes.git.commits);
    app.use(apiRoutes.repository.commits);
    app.use(apiRoutes.repository.contents);
    app.use(apiRoutes.repository.headers);

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

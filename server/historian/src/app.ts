/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as bodyParser from "body-parser";
import * as compression from "compression";
import * as cors from "cors";
// eslint-disable-next-line import/no-duplicates
import * as express from "express";
// eslint-disable-next-line no-duplicate-imports, import/no-duplicates
import { Express } from "express";
import * as morgan from "morgan";
import * as nconf from "nconf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import split = require("split");
import * as winston from "winston";
import * as routes from "./routes";
import { ICache, ITenantService } from "./services";

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(config: nconf.Provider, tenantService: ITenantService, cache: ICache) {
    // Express app configuration
    const app: Express = express();

    // TODO we probably want to switch morgan to use the common format in prod
    app.use(morgan(config.get("logger:morganFormat"), { stream }));

    const requestSize = config.get("requestSizeLimit");
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    app.use(compression());
    app.use(cors());

    const apiRoutes = routes.create(config, tenantService, cache);
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
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        res.status(err.status || 500);
        res.json({
            error: {},
            message: err.message,
        });
    });

    return app;
}

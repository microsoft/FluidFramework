/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { json, urlencoded } from "body-parser";
import cors from "cors";
import express, { Express } from "express";
import nconf from "nconf";
import { ICreateRepoParams } from "@fluidframework/gitresources";
import { DriverVersionHeaderName } from "@fluidframework/server-services-client";
import { BaseTelemetryProperties, HttpProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
    alternativeMorganLoggerMiddleware,
    bindCorrelationId,
    jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import * as routes from "./routes";
import {
    getRepoManagerParamsFromRequest,
    IFileSystemManagerFactory,
    IRepoManagerParams,
    IRepositoryManagerFactory,
} from "./utils";

function getTenantIdForGitRestRequest(params: IRepoManagerParams, request: express.Request) {
    return params.storageRoutingId?.tenantId ?? (request.body as ICreateRepoParams)?.name;
}

export function create(
    store: nconf.Provider,
    fileSystemManagerFactory: IFileSystemManagerFactory,
    repositoryManagerFactory: IRepositoryManagerFactory,
    asyncLocalStorage?: AsyncLocalStorage<string>,
) {
    // Express app configuration
    const app: Express = express();

    const loggerFormat = store.get("logger:morganFormat");
    if (loggerFormat === "json") {
        app.use(jsonMorganLoggerMiddleware(
            "gitrest",
            (tokens, req, res) => {
                const params = getRepoManagerParamsFromRequest(req);
                return {
                    [HttpProperties.driverVersion]: tokens.req(req, res, DriverVersionHeaderName),
                    [BaseTelemetryProperties.tenantId]: getTenantIdForGitRestRequest(params, req),
                    [BaseTelemetryProperties.documentId]: params.storageRoutingId?.documentId,
                };
            }));
    } else {
        app.use(alternativeMorganLoggerMiddleware(loggerFormat));
    }

    const requestSize = store.get("requestSizeLimit");
    app.use(json({ limit: requestSize }));
    app.use(urlencoded({ limit: requestSize, extended: false }));

    app.use(bindCorrelationId(asyncLocalStorage));

    app.use(cors());

    const apiRoutes = routes.create(store, fileSystemManagerFactory, repositoryManagerFactory);
    app.use(apiRoutes.git.blobs);
    app.use(apiRoutes.git.refs);
    app.use(apiRoutes.git.repos);
    app.use(apiRoutes.git.tags);
    app.use(apiRoutes.git.trees);
    app.use(apiRoutes.git.commits);
    app.use(apiRoutes.repository.commits);
    app.use(apiRoutes.repository.contents);
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
            Lumberjack.error(err.message, { status: err.status }, err);
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
        Lumberjack.error(err.message, { status: err.status }, err);
        res.status(err.status || 500);
        res.json({
            error: {},
            message: err.message,
        });
    });

    return app;
}

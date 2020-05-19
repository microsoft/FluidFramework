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
} from "@microsoft/fluid-server-services-core";
import bodyParser from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
// Import { Express } from "express";
import safeStringify from "json-stringify-safe";
import morgan from "morgan";
import { Provider } from "nconf";
import winston from "winston";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import * as alfredRoutes from "./routes";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const split = require("split");

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(
    config: Provider,
    tenantManager: ITenantManager,
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
    app.use(morgan(config.get("logger:morganFormat"), { stream }));

    app.use(cookieParser());
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    // Bind routes
    const routes = alfredRoutes.create(
        config,
        tenantManager,
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

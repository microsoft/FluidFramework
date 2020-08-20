/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorage,
    MongoManager,
} from "@fluidframework/server-services-core";
import * as bodyParser from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Router } from "express";
import safeStringify from "json-stringify-safe";
import morgan from "morgan";
import { Provider } from "nconf";
import * as winston from "winston";
import { create as createRoutes } from "./routes";

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const split = require("split");

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(
    config: Provider,
    storage: IDocumentStorage,
    mongoManager: MongoManager,
) {
    // Maximum REST request size
    const requestSize = config.get("alfred:restJsonSize");

    // Express app configuration
    const app = express();

    // Running behind iisnode
    app.set("trust proxy", 1);

    app.use(compression());
    app.use(morgan(config.get("logger:morganFormat"), { stream }));

    app.use(cookieParser());
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    // Bind routes
    const routes = createRoutes(
        config,
        mongoManager,
        storage);

    app.use(cors());
    app.use(routes.storage);
    app.use(routes.ordering);

    // Basic Help Message
    app.use(Router().get("/", (req, res) => {
        // eslint-disable-next-line max-len
        res.status(200).send("This is Tinylicious. Learn more at https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious");
    }));

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

import { IDocumentStorage, IProducer, ITenantManager } from "@prague/services-core";
import * as utils from "@prague/services-utils";
import * as bodyParser from "body-parser";
import * as compression from "compression";
import * as express from "express";
import { Express } from "express";
import * as morgan from "morgan";
import { Provider } from "nconf";
import split = require("split");
import * as winston from "winston";
import * as alfredRoutes from "./routes";
import { IAlfredTenant } from "./tenant";

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
    mongoManager: utils.MongoManager,
    producer: IProducer) {

    // Maximum REST request size
    const requestSize = config.get("alfred:restJsonSize");

    // Express app configuration
    const app: Express = express();

    app.use(compression());
    app.use(morgan(config.get("logger:morganFormat"), { stream }));
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    // bind routes
    const routes = alfredRoutes.create(config, tenantManager, storage, mongoManager, producer, appTenants);
    app.use(routes);

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

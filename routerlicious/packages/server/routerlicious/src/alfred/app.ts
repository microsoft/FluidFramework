import {
    IAlfredTenant,
    ICache,
    IDocumentStorage,
    IProducer,
    ITenantManager,
    MongoManager,
} from "@prague/services-core";
import * as bodyParser from "body-parser";
import * as compression from "compression";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import { Express } from "express";
import * as safeStringify from "json-stringify-safe";
import * as morgan from "morgan";
import { Provider } from "nconf";
import * as path from "path";
// tslint:disable-next-line:no-var-requires
const split = require("split");
import * as winston from "winston";
import * as alfredRoutes from "./routes";

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
    cache: ICache,
    producer: IProducer) {

    // Maximum REST request size
    const requestSize = config.get("alfred:restJsonSize");

    // Express app configuration
    const app: Express = express();

    // Running behind iisnode
    app.set("trust proxy", 1);

    app.use(compression());
    app.use(morgan(config.get("logger:morganFormat"), { stream }));

    app.use(cookieParser());
    app.use(bodyParser.json({ limit: requestSize }));
    app.use(bodyParser.urlencoded({ limit: requestSize, extended: false }));

    // bind routes
    const routes = alfredRoutes.create(
        config,
        tenantManager,
        mongoManager,
        storage,
        producer,
        appTenants);

    app.use("/public", express.static(path.join(__dirname, "../../public")));
    app.use(routes.api);
    app.use("/agent", routes.agent);
    app.use("/", (request, response) => response.redirect(config.get("gateway:url")));

    // catch 404 and forward to error handler
    app.use((req, res, next) => {
        const err = new Error("Not Found");
        (err as any).status = 404;
        next(err);
    });

    // error handlers

    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.json({ error: safeStringify(err), message: err.message });
    });

    return app;
}

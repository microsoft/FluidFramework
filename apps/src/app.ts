import * as bodyParser from "body-parser";
import * as compression from "compression";
import * as express from "express";
import { Express } from "express";
import * as fs from "fs";
import * as morgan from "morgan";
import { Provider } from "nconf";
import * as path from "path";
import * as favicon from "serve-favicon";
import split = require("split");
import * as expiry from "static-expiry";
import * as winston from "winston";
import * as appRoutes from "./routes";

// Base endpoint to expose static files at
const staticFilesEndpoint = "/public";

// Static cache to help map from full to minified files
const staticMinCache: { [key: string]: string } = {};

// Helper function to translate from a static files URL to the path to find the file
// relative to the static assets directory
function translateStaticUrl(
    url: string,
    cache: { [key: string]: string },
    furl: (name: string) => string,
    production: boolean): string {

    const local = url.substring(staticFilesEndpoint.length);
    if (!(local in cache)) {
        const parsedPath = path.parse(local);
        parsedPath.name = `${parsedPath.name}.min`;
        // base and root are marked undefined to placate the TS definitions and because we want the format to
        // resolve with dir/ext/name. Base and root if defined will override.
        const minified = path.format({
            base: undefined,
            dir: parsedPath.dir,
            ext: parsedPath.ext,
            name: parsedPath.name,
            root: undefined,
        });

        // Cache the result and then update local
        cache[local] =
            production && fs.existsSync(path.join(__dirname, "../public", minified))
                ? minified
                : local;
    }

    return staticFilesEndpoint + furl(cache[local]);
}

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(config: Provider) {
    // Express app configuration
    const app: Express = express();

    app.use(favicon(path.join(__dirname, "../public", "favicon.ico")));
    // TODO we probably want to switch morgan to use the common format in prod
    app.use(morgan(config.get("logger:morganFormat"), { stream }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));

    // Running behind iisnode
    app.set("trust proxy", 1);

    // View engine setup.
    const viewPath = path.join(__dirname, "../views");
    app.set("views", viewPath);
    app.set("view engine", "hjs");

    app.use(compression());
    app.use(favicon(path.join(__dirname, "../public", "favicon.ico")));

    app.use(staticFilesEndpoint, expiry(app, { dir: path.join(__dirname, "../public") }));
    app.locals.hfurl = () => (value: string) => {
        return translateStaticUrl(
            value,
            staticMinCache,
            app.locals.furl,
            app.get("env") === "production");
    };
    app.use(staticFilesEndpoint, express.static(path.join(__dirname, "../public")));

    const routes = appRoutes.create(config);
    app.use("/maps", routes.maps);
    app.use("/cells", routes.cells);

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

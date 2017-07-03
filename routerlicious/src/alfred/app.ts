import * as bodyParser from "body-parser";
import * as express from "express";
import { Express } from "express";
import * as morgan from "morgan";
import * as nconf from "nconf";
import * as passport from "passport";
import * as path from "path";
import * as favicon from "serve-favicon";
import * as expiry from "static-expiry";
import * as utils from "../utils";
import * as routes from "./routes";

// Base endpoint to expose static files at
const staticFilesEndpoint = "/public";

// Helper function to translate from a static files URL to the path to find the file
// relative to the static assets directory
function translateStaticUrl(url: string): string {
    return staticFilesEndpoint + app.locals.furl(url.substring(staticFilesEndpoint.length));
}

// Express app configuration
let app: Express = express();

// Running behind iisnode
app.set("trust proxy", 1);

// view engine setup
app.set("views", path.join(__dirname, "../../views"));
app.set("view engine", "hjs");

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, "../../public", "favicon.ico")));
// TODO we probably want to switch morgan to use the common format in prod
app.use(morgan(nconf.get("logger:morganFormat"), { stream: utils.stream }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(staticFilesEndpoint, expiry(app, { dir: path.join(__dirname, "../../public") }));
app.locals.hfurl = () => (value: string) => translateStaticUrl(value);
app.use(staticFilesEndpoint, express.static(path.join(__dirname, "../../public")));
app.use(passport.initialize());
app.use(passport.session());

// bind routes
app.use("/deltas", routes.deltas);
app.use("/storage", routes.storage);
app.use("/maps", routes.maps);
app.use("/canvas", routes.canvas);
app.use("/sharedText", routes.sharedText);
app.use("/cell", routes.cell);
app.use("/scribe", routes.scribe);
app.use("/perf", routes.perf);
app.use("/producer", routes.producer);
app.use("/object", routes.object);
app.use(routes.home);

// catch 404 and forward to error handler
app.use((req, res, next) => {
    let err = new Error("Not Found");
    (<any> err).status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get("env") === "development") {
    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.render("error", {
            error: err,
            message: err.message,
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.render("error", {
        error: {},
        message: err.message,
    });
});

export default app;

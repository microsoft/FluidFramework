import * as bodyParser from "body-parser";
import * as express from "express";
import * as logger from "morgan";
import * as passport from "passport";
import * as path from "path";
import * as favicon from "serve-favicon";
import * as routes from "./routes";

// Express app configuration
let app = express();

// Running behind iisnode
app.set("trust proxy", 1);

// view engine setup
app.set("views", path.join(__dirname, "../../views"));
app.set("view engine", "hjs");

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, "../../public", "favicon.ico")));
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use("/public", express.static(path.join(__dirname, "../../public")));
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

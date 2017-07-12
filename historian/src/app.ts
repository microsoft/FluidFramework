import * as bodyParser from "body-parser";
import * as express from "express";
import { Express } from "express";
import * as morgan from "morgan";
import * as nconf from "nconf";
import * as api from "./api";
import * as logger from "./logger";

// Express app configuration
const app: Express = express();

logger.logger.info(nconf.get("logger:morganFormat"));

// TODO we probably want to switch morgan to use the common format in prod
app.use(morgan(nconf.get("logger:morganFormat"), { stream: logger.stream }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use("/api", api.router);

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

export default app;

import * as bodyParser from "body-parser";
import * as express from "express";
import { Express } from "express";
import * as routes from "./routes";

// Express app configuration
let app: Express = express();

// Running behind iisnode
app.set("trust proxy", 1);

// View engine setup.
app.set("view engine", "hjs");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// bind routes
app.use("/spellchecker", routes.spellchecker);

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

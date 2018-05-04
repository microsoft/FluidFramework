import * as bodyParser from "body-parser";
import * as express from "express";
import { Express } from "express";
import * as morgan from "morgan";
import split = require("split");
import * as winston from "winston";
import * as utils from "../utils";
import * as api from "./api";

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    winston.info(message);
});

export function create(collectionName: string, mongoManager: utils.MongoManager, loggerFormat: string) {

    // Express app configuration
    const app: Express = express();

    // Running behind iisnode
    app.set("trust proxy", 1);

    // View engine setup.
    app.set("view engine", "hjs");

    app.use(morgan(loggerFormat, { stream }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use("/api", api.create(collectionName, mongoManager));

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

    return app;
};

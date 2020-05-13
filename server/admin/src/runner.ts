/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-core-utils";
import core from "@microsoft/fluid-server-services-core";
import utils from "@microsoft/fluid-server-services-utils";
import { Provider } from "nconf";
import winston from "winston";
import app from "./app";
import { IWebServer, IWebServerFactory } from "./webServer";

export class AdminRunner implements utils.IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private serverFactory: IWebServerFactory,
        private config: Provider,
        private port: string | number,
        private mongoManager: core.MongoManager) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        const admin = app.create(
            this.config,
            this.mongoManager);
        admin.set("port", this.port);

        this.server = this.serverFactory.create(admin);

        const httpServer = this.server.httpServer;

        // Listen on provided port, on all network interfaces.
        httpServer.listen(this.port);
        httpServer.on("error", (error) => this.onError(error));
        httpServer.on("listening", () => this.onListening());

        return this.runningDeferred.promise;
    }

    public stop(): Promise<void> {
        // Close the underlying server and then resolve the runner once closed
        this.server.close().then(
            () => {
                this.runningDeferred.resolve();
            },
            (error) => {
                this.runningDeferred.reject(error);
            });

        return this.runningDeferred.promise;
    }

    /**
     * Event listener for HTTP server "error" event.
     */
    private onError(error) {
        if (error.syscall !== "listen") {
            throw error;
        }

        const bind = typeof this.port === "string"
            ? "Pipe " + this.port
            : "Port " + this.port;

        // handle specific listen errors with friendly messages
        switch (error.code) {
            case "EACCES":
                this.runningDeferred.reject(`${bind} requires elevated privileges`);
                break;
            case "EADDRINUSE":
                this.runningDeferred.reject(`${bind} is already in use`);
                break;
            default:
                throw error;
        }
    }

    /**
     * Event listener for HTTP server "listening" event.
     */
    private onListening() {
        const addr = this.server.httpServer.address();
        const bind = typeof addr === "string"
            ? "pipe " + addr
            : "port " + addr.port;
        winston.info("Listening on " + bind);
    }
}

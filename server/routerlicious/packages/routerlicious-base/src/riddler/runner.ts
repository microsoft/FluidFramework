/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import {
    MongoManager,
    IRunner,
    ISecretManager,
    IWebServerFactory,
    IWebServer,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as winston from "winston";
import * as app from "./app";

export class RiddlerRunner implements IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private readonly serverFactory: IWebServerFactory,
        private readonly collectionName: string,
        private readonly port: string | number,
        private readonly mongoManager: MongoManager,
        private readonly loggerFormat: string,
        private readonly baseOrdererUrl: string,
        private readonly defaultHistorianUrl: string,
        private readonly defaultInternalHistorianUrl: string,
        private readonly secretManager: ISecretManager,
    ) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const riddler = app.create(
            this.collectionName,
            this.mongoManager,
            this.loggerFormat,
            this.baseOrdererUrl,
            this.defaultHistorianUrl,
            this.defaultInternalHistorianUrl,
            this.secretManager);
        riddler.set("port", this.port);

        this.server = this.serverFactory.create(riddler);
        const httpServer = this.server.httpServer;

        httpServer.listen(this.port);
        httpServer.on("error", (error) => this.onError(error));
        httpServer.on("listening", () => this.onListening());

        return this.runningDeferred.promise;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public stop(): Promise<void> {
        // Close the underlying server and then resolve the runner once closed
        this.server.close().then(
            () => {
                this.runningDeferred.resolve();
            },
            (error) => {
                this.runningDeferred.reject(error);
            },
        );
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
            ? `Pipe ${this.port}`
            : `Port ${this.port}`;

        // Handle specific listen errors with friendly messages
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
            ? `pipe ${addr}`
            : `port ${addr.port}`;
        winston.info(`Listening on ${bind}`);
        Lumberjack.info(`Listening on ${bind}`);
    }
}

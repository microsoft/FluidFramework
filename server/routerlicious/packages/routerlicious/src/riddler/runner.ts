/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";
import { Deferred } from "@fluidframework/common-utils";
import { MongoManager } from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import * as winston from "winston";
import * as app from "./app";

export class RiddlerRunner implements utils.IRunner {
    private server: http.Server;
    private runningDeferred: Deferred<void>;

    constructor(
        private readonly collectionName: string,
        private readonly port: string | number,
        private readonly mongoManager: MongoManager,
        private readonly loggerFormat: string,
        private readonly baseOrdererUrl: string,
        private readonly defaultHistorianUrl: string,
        private readonly defaultInternalHistorianUrl: string,
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
            this.defaultInternalHistorianUrl);
        riddler.set("port", this.port);

        this.server = http.createServer(riddler);

        this.server.listen(this.port);
        this.server.on("error", (error) => this.onError(error));
        this.server.on("listening", () => this.onListening());

        return this.runningDeferred.promise;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public stop(): Promise<void> {
        // Close the underlying server and then resolve the runner once closed
        this.server.close(() => {
            this.runningDeferred.resolve();
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
        const addr = this.server.address();
        const bind = typeof addr === "string"
            ? `pipe ${addr}`
            : `port ${addr.port}`;
        winston.info(`Listening on ${bind}`);
    }
}

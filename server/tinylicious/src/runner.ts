/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICollection,
    IDocumentStorage,
    IOrdererManager,
    ITenantManager,
    IWebServer,
    IWebServerFactory,
    MongoManager,
    DefaultMetricClient,
} from "@microsoft/fluid-server-services-core";
import utils from "@microsoft/fluid-server-services-utils";
import { Deferred } from "@microsoft/fluid-core-utils";
import { Provider } from "nconf";
import winston from "winston";
import { configureWebSocketServices } from "@microsoft/fluid-server-lambdas";
import { TestClientManager } from "@microsoft/fluid-server-test-utils";
import app from "./app";

export class TinyliciousRunner implements utils.IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private readonly serverFactory: IWebServerFactory,
        private readonly config: Provider,
        private readonly port: string | number,
        private readonly orderManager: IOrdererManager,
        private readonly tenantManager: ITenantManager,
        private readonly storage: IDocumentStorage,
        private readonly mongoManager: MongoManager,
        private readonly contentCollection: ICollection<any>,
    ) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const alfred = app.create(
            this.config,
            this.storage,
            this.mongoManager);
        alfred.set("port", this.port);

        this.server = this.serverFactory.create(alfred);

        const httpServer = this.server.httpServer;

        configureWebSocketServices(
            this.server.webSocketServer,
            this.orderManager,
            this.tenantManager,
            this.storage,
            this.contentCollection,
            new TestClientManager(),
            new DefaultMetricClient(),
            winston);

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
    }
}

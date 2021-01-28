/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import {
    IClientManager,
    IDocumentStorage,
    IOrdererManager,
    IProducer,
    ITenantManager,
    IWebServer,
    IWebServerFactory,
    MongoManager,
    IThrottler,
} from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { createMetricClient } from "@fluidframework/server-services";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import * as app from "./app";

export class AlfredRunner implements utils.IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private readonly serverFactory: IWebServerFactory,
        private readonly config: Provider,
        private readonly port: string | number,
        private readonly orderManager: IOrdererManager,
        private readonly tenantManager: ITenantManager,
        private readonly restThrottler: IThrottler,
        private readonly socketConnectThrottler: IThrottler,
        private readonly socketSubmitOpThrottler: IThrottler,
        private readonly storage: IDocumentStorage,
        private readonly clientManager: IClientManager,
        private readonly appTenants: IAlfredTenant[],
        private readonly mongoManager: MongoManager,
        private readonly producer: IProducer,
        private readonly metricClientConfig: any) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const alfred = app.create(
            this.config,
            this.tenantManager,
            this.restThrottler,
            this.storage,
            this.appTenants,
            this.mongoManager,
            this.producer);
        alfred.set("port", this.port);

        this.server = this.serverFactory.create(alfred);

        const httpServer = this.server.httpServer;

        const maxNumberOfClientsPerDocument = this.config.get("alfred:maxNumberOfClientsPerDocument");
        const maxTokenLifetimeSec = this.config.get("auth:maxTokenLifetimeSec");
        const isTokenExpiryEnabled = this.config.get("auth:enableTokenExpiration");
        // Register all the socket.io stuff
        configureWebSocketServices(
            this.server.webSocketServer,
            this.orderManager,
            this.tenantManager,
            this.storage,
            this.clientManager,
            createMetricClient(this.metricClientConfig),
            winston,
            maxNumberOfClientsPerDocument,
            maxTokenLifetimeSec,
            isTokenExpiryEnabled,
            this.socketConnectThrottler,
            this.socketSubmitOpThrottler);

        // Listen on provided port, on all network interfaces.
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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IAlfredTenant,
    ICache,
    ICollection,
    IDocumentStorage,
    IOrdererManager,
    IProducer,
    ITenantManager,
    IWebServer,
    IWebServerFactory,
    MongoManager,
} from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Deferred } from "@prague/utils";
import { Provider } from "nconf";
import * as winston from "winston";
import * as app from "./app";
import * as io from "./io";

export class AlfredRunner implements utils.IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private serverFactory: IWebServerFactory,
        private config: Provider,
        private port: string | number,
        private orderManager: IOrdererManager,
        private tenantManager: ITenantManager,
        private storage: IDocumentStorage,
        private cache: ICache,
        private appTenants: IAlfredTenant[],
        private mongoManager: MongoManager,
        private producer: IProducer,
        private metricClientConfig: any,
        private contentCollection: ICollection<any>) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const alfred = app.create(
            this.config,
            this.tenantManager,
            this.storage,
            this.appTenants,
            this.mongoManager,
            this.cache,
            this.producer);
        alfred.set("port", this.port);

        this.server = this.serverFactory.create(alfred);

        const httpServer = this.server.httpServer;

        // Register all the socket.io stuff
        io.register(
            this.server.webSocketServer,
            this.metricClientConfig,
            this.orderManager,
            this.tenantManager,
            this.contentCollection);

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

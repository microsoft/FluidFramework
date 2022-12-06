/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { Deferred } from "@fluidframework/common-utils";
import { IWebServer, IWebServerFactory, IRunner } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import * as app from "./app";
import { IFileSystemManagerFactory, IRepositoryManagerFactory } from "./utils";

export class GitrestRunner implements IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private readonly serverFactory: IWebServerFactory,
        private readonly config: Provider,
        private readonly port: string | number,
        private readonly fileSystemManagerFactory: IFileSystemManagerFactory,
        private readonly repositoryManagerFactory: IRepositoryManagerFactory,
        private readonly asyncLocalStorage?: AsyncLocalStorage<string>) {
    }

    public async start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();
        // Create the gitrest app
        const gitrest = app.create(
            this.config,
            this.fileSystemManagerFactory,
            this.repositoryManagerFactory,
            this.asyncLocalStorage);
        gitrest.set("port", this.port);

        this.server = this.serverFactory.create(gitrest);
        const httpServer = this.server.httpServer;

        // Listen on provided port, on all network interfaces.
        httpServer.listen(this.port);
        httpServer.on("error", (error) => this.onError(error));
        httpServer.on("listening", () => this.onListening());

        return this.runningDeferred.promise;
    }

    public async stop(): Promise<void> {
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

        // handle specific listen errors with friendly messages
        switch (error.code) {
            case "EACCES":
                Lumberjack.error(`${bind} requires elevated privileges`);
                process.exit(1);
                break;
            case "EADDRINUSE":
                Lumberjack.error(`${bind} is already in use`);
                process.exit(1);
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
        Lumberjack.info(`Listening on ${bind}`);
    }
}

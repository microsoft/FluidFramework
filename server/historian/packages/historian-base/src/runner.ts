/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { IWebServer, IWebServerFactory } from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { ICache, ITenantService } from "./services";
import { configureLogging } from "./logger";
import * as app from "./app";

export class HistorianRunner implements utils.IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private readonly serverFactory: IWebServerFactory,
        private readonly config: Provider,
        private readonly port: string | number,
        private readonly riddler: ITenantService,
        private readonly cache: ICache) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();
        configureLogging(this.config.get("logger"));
        // Create the historian app
        const historian = app.create(this.config, this.riddler, this.cache);
        historian.set("port", this.port);

        this.server = this.serverFactory.create(historian);
        const httpServer = this.server.httpServer;

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
            ? `Pipe ${  this.port}`
            : `Port ${  this.port}`;

        // handle specific listen errors with friendly messages
        switch (error.code) {
            case "EACCES":
                winston.error(`${bind  } requires elevated privileges`);
                process.exit(1);
                break;
            case "EADDRINUSE":
                winston.error(`${bind  } is already in use`);
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
            ? `pipe ${  addr}`
            : `port ${  addr.port}`;
        winston.info(`Listening on ${  bind}`);
    }
}

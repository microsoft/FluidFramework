import {
    IAlfredTenant,
    ICache,
    IWebServer,
    IWebServerFactory,
} from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Deferred } from "@prague/utils";
import { Provider } from "nconf";
import * as winston from "winston";
import * as app from "./app";
import { IAlfred } from "./interfaces";

export class GatewayRunner implements utils.IRunner {
    private server: IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private serverFactory: IWebServerFactory,
        private config: Provider,
        private port: string | number,
        private cache: ICache,
        private alfred: IAlfred,
        private appTenants: IAlfredTenant[]) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const gateway = app.create(
            this.config,
            this.alfred,
            this.appTenants,
            this.cache);
        gateway.set("port", this.port);

        this.server = this.serverFactory.create(gateway);
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

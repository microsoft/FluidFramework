import * as git from "gitresources";
import { Provider } from "nconf";
import * as winston from "winston";
import * as core from "../core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import * as app from "./app";
import * as io from "./io";
import * as io2 from "./io2";

export class AlfredRunner implements utils.IRunner {
    private server: core.IWebServer;
    private server2: core.IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private serverFactory: core.IWebServerFactory,
        private serverFactory2: core.IWebServerFactory,
        private config: Provider,
        private port: string | number,
        private historian: git.IHistorian,
        private mongoManager: utils.MongoManager,
        private producer: utils.kafkaProducer.IProducer,
        private documentsCollectionName: string,
        private metricClientConfig: any) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const alfred = app.create(this.config, this.historian, this.mongoManager);
        alfred.set("port", this.port);

        this.server = this.serverFactory.create(alfred);
        // this.serverFactory2 = null;
        this.server2 = this.serverFactory2.create(alfred);

        // const httpServer = this.server.httpServer;
        const httpServer2 = this.server2.httpServer;

        // Register all the socket.io stuff
        io.register(
            this.server.webSocketServer,
            this.config,
            this.mongoManager,
            this.producer,
            this.documentsCollectionName,
            this.metricClientConfig);

        // Remove (mdaumi): We need to register one.
        io2.register(
            this.server2.webSocketServer,
            this.config,
            this.mongoManager,
            this.producer,
            this.documentsCollectionName,
            this.metricClientConfig);

        // Listen on provided port, on all network interfaces.
        // httpServer.listen(this.port);
        // httpServer.on("error", (error) => this.onError(error));
        // httpServer.on("listening", () => this.onListening());

        httpServer2.on("error", (error) => this.onError(error));
        httpServer2.on("listening", () => this.onListening());

        return this.runningDeferred.promise;
    }

    public stop(): Promise<void> {
        // Close the underlying server and then resolve the runner once closed
        this.server2.close().then(
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

        let bind = typeof this.port === "string"
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
        let addr = this.server2.httpServer.address();
        let bind = typeof addr === "string"
            ? "pipe " + addr
            : "port " + addr.port;
        winston.info("Listening on " + bind);
    }
}

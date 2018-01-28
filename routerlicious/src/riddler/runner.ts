import * as http from "http";
import * as winston from "winston";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import * as app from "./app";

export class RiddlerRunner implements utils.IRunner {
    private server: http.Server;
    private runningDeferred: Deferred<void>;

    constructor(
        private collectionName: string,
        private port: string | number,
        private mongoManager: utils.MongoManager,
        private hashKey: string) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const riddler = app.create(this.collectionName, this.mongoManager, this.hashKey);
        riddler.set("port", this.port);

        this.server = http.createServer(riddler);

        this.server.listen(this.port);
        this.server.on("error", (error) => this.onError(error));
        this.server.on("listening", () => this.onListening());

        return this.runningDeferred.promise;
    }

    public stop(): Promise<void> {
        // Close the underlying server and then resolve the runner once closed
        this.server.close(() => {
                this.runningDeferred.resolve();
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
        let addr = this.server.address();
        let bind = typeof addr === "string"
            ? "pipe " + addr
            : "port " + addr.port;
        winston.info("Listening on " + bind);
    }
}

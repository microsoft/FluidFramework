import { /*IDocumentStorage, IProducer,*/ ITenantManager } from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Deferred } from "@prague/utils";
import * as http from "http";
import { Provider } from "nconf";
import * as winston from "winston";
import * as app from "./app";
import * as io from "./io";
// import { OrdererManager } from "./orderFactory";
// import { IAlfredTenant } from "./tenant";

export class JarvisRunner implements utils.IRunner {
    private server: http.Server;
    private runningDeferred: Deferred<void>;

    constructor(
        private config: Provider,
        private port: string | number,
        // private orderManager: OrdererManager,
        private tenantManager: ITenantManager,
        // private storage: IDocumentStorage,
        // private appTenants: IAlfredTenant[],
        // private mongoManager: utils.MongoManager,
        // private producer: 
        ) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const alfred = app.create(
            this.config,
            this.tenantManager,
            //this.storage,
            //this.appTenants,
            //this.mongoManager,
            //this.producer
            );
        alfred.set("port", this.port);

        this.server = http.createServer(alfred);
        //const redis = this.config.get("redis");

        // Register all the socket.io stuff
        io.register(
            this.server,
            //this.orderManager,
            this.tenantManager,
            //redis
            );

        // Listen on provided port, on all network interfaces.
        this.server.listen(this.port);
        this.server.on("error", (error) => this.onError(error));
        this.server.on("listening", () => this.onListening());

        return this.runningDeferred.promise;
    }

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
        const addr = this.server.address();
        const bind = typeof addr === "string"
            ? "pipe " + addr
            : "port " + addr.port;
        winston.info("Listening on " + bind);
    }
}

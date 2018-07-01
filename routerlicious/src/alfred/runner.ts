import * as assert from "assert";
import * as async from "async";
import { Provider } from "nconf";
import * as winston from "winston";
import * as ws from "ws";
import { IOrderer, IOrdererManager, IOrdererSocket, ITenantManager } from "../core";
import * as core from "../core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import * as app from "./app";
import * as io from "./io";
import { IAlfredTenant } from "./tenant";

class RemoteConnection implements IOrdererSocket {
    private q: async.AsyncQueue<core.IRawOperationMessage>;
    private orderer: IOrderer;

    constructor(
        orderManager: IOrdererManager,
        private socket: ws,
        tenantId: string,
        documentId: string) {

        const ordererP = orderManager.getOrderer(this, tenantId, documentId);
        ordererP.then(
            (orderer) => {
                winston.info(`Orderer set`);
                this.orderer = orderer;
                this.q.resume();
            },
            (error) => {
                this.q.kill();
            });

        this.q = async.queue<core.IRawOperationMessage, any>((message, callback) => {
            // tslint:disable-next-line
            winston.info(`Remote order request ${message.tenantId}/${message.documentId}@${message.operation.clientSequenceNumber}`);
            this.orderer.order(message, message.documentId);
            callback();
        });
        this.q.pause();
    }

    public order(message: core.IRawOperationMessage) {
        this.q.push(message);
    }

    public send(op: string, id: string, data: any[]) {
        this.socket.send(JSON.stringify({ op, id, data }));
    }
}

export class AlfredRunner implements utils.IRunner {
    private server: core.IWebServer;
    private runningDeferred: Deferred<void>;

    constructor(
        private serverFactory: core.IWebServerFactory,
        private config: Provider,
        private port: string | number,
        private orderManager: IOrdererManager,
        private tenantManager: ITenantManager,
        private appTenants: IAlfredTenant[],
        private mongoManager: utils.MongoManager,
        private producer: utils.IProducer,
        private documentsCollectionName: string,
        private metricClientConfig: any) {
    }

    public start(): Promise<void> {
        this.runningDeferred = new Deferred<void>();

        // Create the HTTP server and attach alfred to it
        const alfred = app.create(
            this.config,
            this.tenantManager,
            this.appTenants,
            this.mongoManager,
            this.producer);
        alfred.set("port", this.port);

        this.server = this.serverFactory.create(alfred);

        const httpServer = this.server.httpServer;

        // Register all the socket.io stuff
        io.register(
            this.server.webSocketServer,
            this.mongoManager,
            this.documentsCollectionName,
            this.metricClientConfig,
            this.orderManager,
            this.tenantManager);

        // Listen on provided port, on all network interfaces.
        httpServer.listen(this.port);
        httpServer.on("error", (error) => this.onError(error));
        httpServer.on("listening", () => this.onListening());

        // Start up the peer-to-peer socket server - will eventually want to consolidate this inside
        // existing services
        const webSocketServer = new ws.Server({
            port: 4000,
        });
        webSocketServer.on("connection", (socket) => {
            const remoteConnectionMap = new Map<string, RemoteConnection>();

            socket.on("message", (message) => {
                winston.info(`Inbound message ${message}`);
                const parsed = JSON.parse(message as string);

                // Listen for connection requests and then messages sent to them
                if (parsed.op === "connect") {
                    winston.info(`Connected to ${parsed.tenantId} ${parsed.documentId}`);
                    const remote = new RemoteConnection(this.orderManager, socket, parsed.tenantId, parsed.documentId);
                    remoteConnectionMap.set(`${parsed.tenantId}/${parsed.documentId}`, remote);
                } else if (parsed.op === "message") {
                    winston.info(`  ---  Got a message to process`);
                    const rawOperation = parsed.data as core.IRawOperationMessage;
                    const id = `${rawOperation.tenantId}/${rawOperation.documentId}`;
                    assert(remoteConnectionMap.has(id));
                    remoteConnectionMap.get(id).order(rawOperation);
                    winston.info(`  ---  DONE processing`);
                }
            });
        });

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

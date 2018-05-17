import { EventEmitter } from "events";
import * as api from "../api-core";
import { BatchManager } from "../core-utils";
import { debug } from "./debug";
import * as messages from "./messages";

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection implements api.IDocumentDeltaConnection {
    public static async Create(
        tenantId: string,
        id: string,
        token: string,
        io: SocketIOClientStatic,
        url: string): Promise<api.IDocumentDeltaConnection> {

        const socket = io(
            url,
            {
                reconnection: false,
                transports: ["websocket"],
            });

        const connectMessage: messages.IConnect = {
            id,
            tenantId,
            token,  // token is going to indicate tenant level information, etc...
        };

        const connection = await new Promise<messages.IConnected>((resolve, reject) => {
            // Listen for connection issues
            socket.on("connect_error", (error) => {
                reject(error);
            });

            socket.emit(
                "connectDocument",
                connectMessage,
                (error, response: messages.IConnected) => {
                    if (error) {
                        return reject(error);
                    } else {
                        return resolve(response);
                    }
                });
        });

        const deltaConnection = new DocumentDeltaConnection(socket, id, connection);

        return deltaConnection;
    }

    private emitter = new EventEmitter();
    private submitManager: BatchManager<api.IDocumentMessage>;

    public get clientId(): string {
        return this.details.clientId;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string {
        return this.details.parentBranch;
    }

    public get user(): api.ITenantUser {
        return this.details.user;
    }

    constructor(
        private socket: SocketIOClient.Socket,
        public documentId: string,
        public details: messages.IConnected) {

        this.submitManager = new BatchManager<api.IDocumentMessage>((submitType, work) => {
            this.socket.emit(
                submitType,
                this.details.clientId,
                work,
                (error) => {
                    if (error) {
                        debug("Emit error", error);
                    }
                });
        });
    }

    /**
     * Subscribe to events emitted by the document
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        // Register for the event on socket.io
        this.socket.on(
            event,
            (...args: any[]) => {
                this.emitter.emit(event, ...args);
            });

        // And then add the listener to our event emitter
        this.emitter.on(event, listener);

        return this;
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(message: api.IDocumentMessage): void {
        this.submitManager.add("submitOp", message);
    }

    public disconnect() {
        this.socket.disconnect();
    }
}

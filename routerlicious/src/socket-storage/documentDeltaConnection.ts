import { EventEmitter } from "events";
import * as api from "../api-core";
import { BatchManager, Deferred, IAuthenticatedUser } from "../core-utils";
import * as messages from "./messages";

/**
 * A pending message the batch manager is holding on to
 */
interface IPendingSend {
    // The deferred is used to resolve a promise once the message is sent
    deferred: Deferred<any>;

    // The message to send
    message: any;
}

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection implements api.IDocumentDeltaConnection {
    public static async Create(
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
            token,  // token is going to indicate tenant level information, etc...
        };

        const connection = await new Promise<messages.IConnected>((resolve, reject) => {
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

        let deltaConnection = new DocumentDeltaConnection(socket, id, connection);

        return deltaConnection;
    }

    private emitter = new EventEmitter();
    private submitManager: BatchManager<IPendingSend>;

    public get clientId(): string {
        return this.details.clientId;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string {
        return this.details.parentBranch;
    }

    public get user(): IAuthenticatedUser {
        return this.details.user;
    }

    constructor(
        private socket: SocketIOClient.Socket,
        public documentId: string,
        public details: messages.IConnected) {

        this.submitManager = new BatchManager<IPendingSend>((submitType, work) => {
            this.socket.emit(submitType, this.details.clientId, work.map((message) => message.message), (error) => {
                if (error) {
                    work.forEach((message) => message.deferred.reject(error));
                } else {
                    work.forEach((message) => message.deferred.resolve());
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
    public submit(message: api.IDocumentMessage): Promise<void> {
        const deferred = new Deferred<any>();
        this.submitManager.add("submitOp", { deferred, message } );
        return deferred.promise;
    }

    public disconnect() {
        this.socket.disconnect();
    }
}

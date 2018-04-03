import cloneDeep = require("lodash/cloneDeep");
import performanceNow = require("performance-now");
import * as request from "request";
import * as io from "socket.io-client";
import * as api from "../api-core";
import { GitManager } from "../git-storage";
import { DocumentStorageService } from "./blobStorageService";
import { debug } from "./debug";
import { DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentDeltaConnection } from "./documentDeltaConnection";
import * as messages from "./messages";

// Type aliases for mapping from events, to the objects interested in those events, to the connections for those
// objects
type ConnectionMap = { [connectionId: string]: api.IDocumentDeltaConnection };
type ObjectMap = { [objectId: string]: ConnectionMap };
type EventMap = { [event: string]: ObjectMap };

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    private eventMap: EventMap = {};
    private socket: SocketIOClient.Socket;

    constructor(
        private url: string,
        private deltaStorage: api.IDeltaStorageService,
        private gitManager: GitManager) {

        debug(`Creating document service ${performanceNow()}`);
        this.socket = io(
            url,
            {
                reconnection: false,
                transports: ["websocket"],
            });
    }

    public async connectToStorage(id: string, token: string): Promise<api.IDocumentStorageService> {
        return new DocumentStorageService(id, this.gitManager);
    }

    public async connectToDeltaStorage(id: string, token: string): Promise<api.IDocumentDeltaStorageService> {
        return new DocumentDeltaStorageService(id, this.deltaStorage);
    }

    public async connectToDeltaStream(id: string, token: string): Promise<api.IDocumentDeltaConnection> {
        const connectMessage: messages.IConnect = {
            id,
            token,  // token is going to indicate tenant level information, etc...
        };

        const connectionP = new Promise<messages.IConnected>((resolve, reject) => {
            this.socket.emit(
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

        const connection = await connectionP;
        let deltaConnection = new DocumentDeltaConnection(
            this,
            id,
            connection);

        return deltaConnection;
    }

    public async branch(id: string, token: string): Promise<string> {
        const forkId = await this.createFork(id);
        return forkId;
    }

    /**
     * Emits a message on the socket
     */
    public emit(event: string, ...args: any[]) {
        this.socket.emit(event, ...args);
    }

    /**
     * Registers the given connection to receive events of the given type
     */
    public registerForEvent(event: string, connection: api.IDocumentDeltaConnection) {
        // See if we're already listening for the given event - if not start
        if (!(event in this.eventMap)) {
            this.eventMap[event] = {};
            this.socket.on(
                event,
                (documentId: string, message: any) => {
                    this.handleMessage(event, documentId, message);
                });
        }

        // Register the object for the given event
        const objectMap = this.eventMap[event];
        if (!(connection.documentId in objectMap)) {
            objectMap[connection.documentId] = {};
        }

        // And finally store the connection as interested in the given event
        objectMap[connection.documentId][connection.clientId] = connection;
    }

    /**
     * Handles a message received from the other side of the socket. This message routes it to the connection
     * that has registered to receive events of that type.
     */
    private handleMessage(event: string, documentId: string, message: any) {
        const objectMap = this.eventMap[event];
        if (!objectMap) {
            return;
        }

        const connectionMap = objectMap[documentId];
        if (!connectionMap) {
            return;
        }

        // Route message to all registered clients
        for (const clientId in connectionMap) {
            if (connectionMap[clientId]) {
                const clone = cloneDeep(message);
                connectionMap[clientId].dispatchEvent(event, clone);
            }
        }
    }

    private createFork(id: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            request.post(
                { url: `${this.url}/documents/${id}/forks`, json: true },
                (error, response, body) => {
                    if (error) {
                        reject(error);
                    } else if (response.statusCode !== 201) {
                        reject(response.statusCode);
                    } else {
                        resolve(body);
                    }
                });
        });
    }
}

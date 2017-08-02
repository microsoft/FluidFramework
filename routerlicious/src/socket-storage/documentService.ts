import * as io from "socket.io-client";
import * as api from "../api";
import { BlobStorageService, DocumentStorageService } from "./blobStorageService";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentDeltaConnection } from "./documentDeltaConnection";
import * as messages from "./messages";

// Type aliases for mapping from events, to the objects interested in those events, to the connections for those
// objects
type ConnectionMap = { [connectionId: string]: DocumentDeltaConnection };
type ObjectMap = { [objectId: string]: ConnectionMap };
type EventMap = { [event: string]: ObjectMap };

class Document implements api.IDocument {
    constructor(
        public documentId: string,
        public clientId: string,
        public existing: boolean,
        public version: string,
        public deltaConnection: api.IDocumentDeltaConnection,
        public documentStorageService: api.IDocumentStorageService,
        public deltaStorageService: api.IDeltaStorageService,
        public distributedObjects: api.IDistributedObject[],
        public pendingDeltas: api.ISequencedMessage[],
        public sequenceNumber: number) {
    }
}

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    private eventMap: EventMap = {};
    private socket;

    constructor(url: string, private deltaStorage: DeltaStorageService, private blobStorge: BlobStorageService) {
        this.socket = io(url, { transports: ["websocket"] });
    }

    public connect(id: string): Promise<api.IDocument> {
        const connectMessage: messages.IConnect = { id };

        return new Promise((resolve, reject) => {
            this.socket.emit(
                "connect",
                connectMessage,
                (error, response: messages.IConnected) => {
                    if (error) {
                        return reject(error);
                    } else {
                        const deltaConnection = new DocumentDeltaConnection(this, id, response.clientId);
                        const deltaStorage = new DocumentDeltaStorageService(id, this.deltaStorage);
                        const documentStorage = new DocumentStorageService(id, response.version, this.blobStorge);

                        const document = new Document(
                            id,
                            response.clientId,
                            response.existing,
                            response.version,
                            deltaConnection,
                            documentStorage,
                            deltaStorage,
                            response.distributedObjects,
                            response.pendingDeltas,
                            response.sequenceNumber);

                        resolve(document);
                    }
                });
        });
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
    public registerForEvent(event: string, connection: DocumentDeltaConnection) {
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
                connectionMap[clientId].dispatchEvent(event, message);
            }
        }
    }
}

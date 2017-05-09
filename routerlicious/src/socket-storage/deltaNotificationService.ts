import * as io from "socket.io-client";
import * as api from "../api";
import { DeltaConnection } from "./deltaConnection";
import * as messages from "./messages";

// Type aliases for mapping from events, to the objects interested in those events, to the connectiosn for those
// objects
type ConnectionMap = { [connectionId: string]: DeltaConnection };
type ObjectMap = { [objectId: string]: ConnectionMap };
type EventMap = { [event: string]: ObjectMap };

/**
 * The DeltaNotificationService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DeltaNotificationService implements api.IDeltaNotificationService {
    private eventMap: EventMap = {};
    private socket;

    constructor(url: string) {
        this.socket = io(url);
    }

    public connect(id: string, type: string): Promise<api.IDeltaConnection> {
        const connectMessage: messages.IConnect = {
            objectId: id,
            type,
        };

        return new Promise((resolve, reject) => {
            this.socket.emit(
                "connectObject",
                connectMessage,
                (error, response: messages.IConnected) => {
                    if (error) {
                        return reject(error);
                    } else {
                        const connection = new DeltaConnection(
                            this,
                            id,
                            response.clientId,
                            response.existing);
                        resolve(connection);
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
    public registerForEvent(event: string, connection: DeltaConnection) {
        // See if we're already listening for the given event - if not start
        if (!(event in this.eventMap)) {
            this.eventMap[event] = {};
            this.socket.on(
                event,
                (objectId: string, message: any) => {
                    this.handleMessage(event, objectId, message);
                });
        }

        // Register the object for the given event
        const objectMap = this.eventMap[event];
        if (!(connection.objectId in objectMap)) {
            objectMap[connection.objectId] = {};
        }

        // And finally store the connection as interested in the given event
        objectMap[connection.objectId][connection.clientId] = connection;
    }

    /**
     * Handles a message received from the other side of the socket. This message routes it to the connection
     * that has registered to receive events of that type.
     */
    private handleMessage(event: string, objectId: string, message: any) {
        const objectMap = this.eventMap[event];
        if (!objectMap) {
            return;
        }

        const connectionMap = objectMap[objectId];
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

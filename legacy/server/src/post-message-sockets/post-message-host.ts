import { Promise } from "es6-promise";
import { Deferred } from "../promise-utils/index";
import { IMessage, IPacket, MessageType, PostMessageSocketProtocol } from "./messages";
import { IPostMessageSocket, PostMessageSocket } from "./post-message-socket";

interface IPendingConnection {
    window: Window;
    targetOrigin: string;
    deferred: Deferred<PostMessageSocket>;
}

export interface IPostMessageHost {
    listen(connectionCallback: (connection: IPostMessageSocket) => void);

    connect(window: Window, targetOrigin: string): Promise<IPostMessageSocket>;
}

export class PostMessageHost implements IPostMessageHost {
    private connectionCallback: (connection: PostMessageSocket) => void;

    private nextMessageId: number = 0;
    private nextConnectionId: number = 0;

    // Map from source id -> destId -> socket
    private connectionMap: { [key: number]: { [key: number]: PostMessageSocket } } = {};
    private pendingConnections: { [key: number]: IPendingConnection } = {};

    constructor(public window: Window) {
        // Start listeneing for events - we will need this for both the client and the Server
        // connections
        this.window.addEventListener("message", (event) => this.listener(event));
    }

    /**
     * Listens for new connections on the given host
     */
    public listen(connectionCallback: (connection: PostMessageSocket) => void) {
        if (this.connectionCallback) {
            throw "Host already listening for new connections";
        }

        this.connectionCallback = connectionCallback;
    }

    /**
     * Creates a new connection to the given window
     */
    public connect(window: Window, targetOrigin: string): Promise<PostMessageSocket> {
        // Create the ID to identify the client end of the connection
        let clientId = this.nextConnectionId++;

        // Send the connection message
        let message: IPacket = {
            destId: undefined,
            protocolId: PostMessageSocketProtocol,
            sourceId: clientId,
            type: MessageType.Connect,
        };
        window.postMessage(message, targetOrigin);

        // And then add a new entry to the pending connection list
        let pendingConnection: IPendingConnection = {
            deferred: new Deferred<PostMessageSocket>(),
            targetOrigin,
            window,
        };
        this.pendingConnections[clientId] = pendingConnection;

        return pendingConnection.deferred.promise;
    }

    /**
     * Retrieves a new number to represent a message
     */
    public getMessageId(): number {
        return this.nextMessageId++;
    }

    /**
     * Client is requesting to connect to the server
     */
    private processConnect(event: MessageEvent, message: IPacket): void {
        // Ignore connection events if we aren"t listening
        if (!this.connectionCallback) {
            // tslint:disable-next-line:no-console
            console.log("Client is attempting to connect but the server is not listening");
            return;
        }

        // Store the new connection in the map
        let connectionId = this.getConnectionId();
        let socket = new PostMessageSocket(this, connectionId, message.sourceId, event.source, event.origin);
        this.storeSocket(connectionId, message.sourceId, socket);

        // Reply to the connection request to complete the connection process
        let ack: IPacket = {
            destId: message.sourceId,
            protocolId: PostMessageSocketProtocol,
            sourceId: connectionId,
            type: MessageType.ConnectAck,
        };
        event.source.postMessage(ack, event.origin);

        // And raise an event with the new connection on the next tick
        this.connectionCallback(socket);
    }

    /**
     * Retrieves a new number to represent a connection
     */
    private getConnectionId(): number {
        return this.nextConnectionId++;
    }

    /**
     * Completes the connection request by ACK"ing the connect request
     */
    private processConnectAck(event: MessageEvent, message: IPacket): void {
        // Validate the request
        let pendingConnection = this.pendingConnections[message.destId];
        if (!pendingConnection || pendingConnection.window !== event.source ||
            (pendingConnection.targetOrigin !== "*" && pendingConnection.targetOrigin !== event.origin)) {
            console.error("Invalid connection ack received");
        }

        // Remove the pending connection
        delete this.pendingConnections[message.destId];

        // And convert it to a real one
        let socket = new PostMessageSocket(this, message.destId, message.sourceId, event.source, event.origin);
        this.storeSocket(message.destId, message.sourceId, socket);

        // And resolve the deferred
        pendingConnection.deferred.resolve(socket);
    }

    private storeSocket(sourceId: number, destId: number, socket: PostMessageSocket): void {
        if (!this.connectionMap[sourceId]) {
            this.connectionMap[sourceId] = {};
        }
        this.connectionMap[sourceId][destId] = socket;
    }

    private processMessage(event: MessageEvent, message: IMessage): void {
        // Lookup the socket associated with the incoming message
        let socket = this.connectionMap[message.destId] ? this.connectionMap[message.destId][message.sourceId] : null;
        if (!socket) {
            console.error("Message associated with unknown socket received");
            return;
        }

        socket.processMessage(event, message);
    }

    /**
     * Listens for postMessage events
     */
    private listener(event: Event): void {
        // Get the message - we only listen to events going to our lab ID and that are valid JSON
        let messageEvent = event as MessageEvent;
        let message = messageEvent.data as IMessage;

        // Make sure we only process messages that are following our protocol
        if (message.protocolId !== PostMessageSocketProtocol) {
            return;
        }

        // Now we can process the message
        switch (message.type) {
            case MessageType.Connect:
                return this.processConnect(messageEvent, message);

            case MessageType.ConnectAck:
                return this.processConnectAck(messageEvent, message);

            case MessageType.Message:
            case MessageType.Completion:
            case MessageType.Failure:
                return this.processMessage(messageEvent, message);

            default:
                console.error("Unknown message type");
        }
    }
}

import { IObjectMessage, ISequencedObjectMessage } from "./protocol";
import { ITree } from "./storage";

// NOTE this may want to move to the protocol
export enum ConnectionState {
    /**
     * The document is no longer connected to the delta server
     */
    Disconnected,

    /**
     * The document has an inbound connection but is still pending for outbound deltas
     */
    Connecting,

    /**
     * The document is fully connected
     */
    Connected,
}

export interface IAttachMessage {
    // The identifier for the object
    id: string;

    // The type of object
    type: string;

    // Initial snapshot of the document
    snapshot: ITree;
}

export interface IDeltaHandler {
    prepare: (message: ISequencedObjectMessage, local: boolean) => Promise<any>;

    process: (message: ISequencedObjectMessage, local: boolean, context: any) => void;

    minSequenceNumberChanged: (value: number) => void;

    /**
     * State change events to indicate changes to the delta connection
     */
    setConnectionState(state: ConnectionState): void;
}

/**
 * Interface to represent a connection to a delta notification stream.
 */
export interface IDeltaConnection {
    // clientId: string;

    state: ConnectionState;

    /**
     * Send new messages to the server
     */
    submit(message: IObjectMessage): void;

    /**
     * Attaches a message handler to the delta connection
     */
    attach(handler: IDeltaHandler): void;
}

export interface IObjectStorageService {
    /**
     * Reads the object contained at the given path. Returns a base64 string representation for the object.
     */
    read(path: string): Promise<string>;
}

export interface IDistributedObjectServices {
    deltaConnection: IDeltaConnection;

    objectStorage: IObjectStorageService;
}

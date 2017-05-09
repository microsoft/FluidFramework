import { IMessage, ISequencedMessage } from "./protocol";

/**
 * Interface to provide access to snapshots saved for a collaborative object
 */
export interface IObjectStorageService {
    /**
     * Reads the object with the given ID
     */
    // TODO should we just provide file system like semantics here or expose block level access
    read(id: string): Promise<any>;

    /**
     * Writes to the object with the given ID
     */
    write(id: string, data: any): Promise<void>;
}

/**
 * Interface to provide access to stored deltas for a collaborative object
 */
export interface IDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    get(id: string, from?: number, to?: number): Promise<ISequencedMessage[]>;
}

/**
 * Interface to represent a connection to a delta notification stream
 */
export interface IDeltaConnection {
    /**
     * The object the connection is for
     */
    objectId: string;

    /**
     * Client identifier for this session
     */
    clientId: string;

    /**
     * Whether or not the document existed prior to connection
     */
    existing: boolean;

    /**
     * Subscribe to events emitted by the document
     */
    on(event: string, listener: Function): this;

    /**
     * Send new messages to the server
     */
    submitOp(message: IMessage);
}

/**
 * The delta notification service provides the ability to connect to a collaborative object's delta stream
 * to send and receive notifications
 */
export interface IDeltaNotificationService {
    /**
     * Connects to the given object ID to send and receive Delta updates. If the object doesn't exist this call
     * will also create it.
     */
    connect(id: string, type: string): Promise<IDeltaConnection>;
}

export interface ICollaborationServices {
    objectStorageService: IObjectStorageService;
    deltaStorageService: IDeltaStorageService;
    deltaNotificationService: IDeltaNotificationService;
}

export interface IOptions {
    /**
     * Access token to the storage system
     */
    token: string;
}

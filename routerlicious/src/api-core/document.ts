// tslint:disable:ban-types
import { EventEmitter } from "events";
import { IEnvelope, IObjectMessage, ISequencedObjectMessage, ITenantUser } from "./protocol";
import { ICollaborativeObject, IDataBlob } from "./types";

export interface IDeltaManager {
    // The queue of inbound delta messages
    inbound: IDeltaQueue;

    // the queue of outbound delta messages
    outbound: IDeltaQueue;
}

export interface IDeltaQueue extends EventEmitter {
    /**
     * Flag indicating whether or not the queue was paused
     */
    paused: boolean;

    /**
     * The number of messages remaining in the queue
     */
    length: number;

    /**
     * Flag indicating whether or not the queue is empty
     */
    empty: boolean;

    /**
     * Pauses processing on the queue
     */
    pause();

    /**
     * Resumes processing on the queue
     */
    resume();
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

export interface IDeltaHandler {
    prepare: (message: ISequencedObjectMessage) => Promise<any>;

    process: (message: ISequencedObjectMessage, context: any) => void;

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

export interface IDocument {
    id: string;

    clientId: string;

    deltaManager: IDeltaManager;

    options: Object;

    create(type: string, id?: string): ICollaborativeObject;

    attach(object: ICollaborativeObject): IDistributedObjectServices;

    get(id: string): Promise<ICollaborativeObject>;

    getUser(): ITenantUser;

    uploadBlob(blob: IDataBlob): Promise<IDataBlob>;

    getBlob(sha: string): Promise<IDataBlob>;

    snapshot(message: string): Promise<void>;

    submitObjectMessage(envelope: IEnvelope);
}

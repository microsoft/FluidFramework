import { EventEmitter } from "events";
import { IContentModelExtension } from "./extension";
import { IAuthenticatedUser, IEnvelope, ILatencyMessage, IObjectMessage, ISequencedObjectMessage } from "./protocol";
import { ICollaborativeObject } from "./types";

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
    setConnectionState(state: ConnectionState, context?: any): void;
}

/**
 * Interface to represent a connection to a delta notification stream.
 */
export interface IDeltaConnection {
    clientId: string;

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

    getContentModel(type: string): IContentModelExtension;

    getUser(): IAuthenticatedUser;

    snapshot(message: string): Promise<void>;

    submitObjectMessage(envelope: IEnvelope);

    // TODO Should I hide this internally on the message - doesn't seem to be a primary object
    submitLatencyMessage(message: ILatencyMessage);
}

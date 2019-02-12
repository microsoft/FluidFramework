import {
    ConnectionState,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ITree,
} from "@prague/container-definitions";

export interface IChannel {
    /**
     * A readonly identifier for the collaborative object
     */
    readonly id: string;

    readonly type: string;

    dirty: boolean;

    ready(): Promise<void>;

    snapshot(): ITree;

    transform(message: ISequencedDocumentMessage, sequenceNumber: number): ISequencedDocumentMessage;

    isLocal(): boolean;
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
    prepare: (message: ISequencedDocumentMessage, local: boolean) => Promise<any>;

    process: (message: ISequencedDocumentMessage, local: boolean, context: any) => void;

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
    submit(message: IDocumentMessage): void;

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

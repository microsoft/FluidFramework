import { IAuthenticatedUser } from "../core-utils";
import { IEnvelope, ILatencyMessage, IObjectMessage, ISequencedObjectMessage } from "./protocol";
import { ICollaborativeObject } from "./types";

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

export interface IDeltaHandler {
    prepare: (message: ISequencedObjectMessage) => Promise<any>;

    process: (message: ISequencedObjectMessage, context: any) => void;

    minSequenceNumberChanged: (value: number) => void;
}

/**
 * Interface to represent a connection to a delta notification stream.
 */
export interface IDeltaConnection {
    /**
     * Send new messages to the server
     */
    submit(message: IObjectMessage): Promise<void>;

    /**
     * Attaches a message handler to the delta connection
     */
    attach(handler: IDeltaHandler): void;
}

export interface IDocument {
    id: string;

    clientId: string;

    options: Object;

    create(type: string, id?: string): ICollaborativeObject;

    attach(object: ICollaborativeObject): IDistributedObjectServices;

    get(id: string): Promise<ICollaborativeObject>;

    getUser(): IAuthenticatedUser;

    submitObjectMessage(envelope: IEnvelope);

    // TODO Should I hide this internally on the message - doesn't seem to be a primary object
    submitLatencyMessage(message: ILatencyMessage);
}

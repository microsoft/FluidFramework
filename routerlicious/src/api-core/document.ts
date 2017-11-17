import { IEnvelope, ILatencyMessage, IObjectMessage, ITrace } from "./protocol";
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

/**
 * Interface to represent a connection to a delta notification stream
 */
export interface IDeltaConnection {
    minimumSequenceNumber: number;

    referenceSequenceNumber: number;

    baseSequenceNumber: number;

    /**
     * Subscribe to events emitted by the object
     */
    on(event: string, listener: Function): this;

    /**
     * Send new messages to the server
     */
    submit(message: IObjectMessage): Promise<void>;

    setBaseMapping(sequenceNumber: number, documentSequenceNumber: number);

    baseMappingIsSet(): boolean;

    transformDocumentSequenceNumber(value: number);

    emit(message: IObjectMessage, clientId: string, documentSequenceNumber: number,
        documentMinimumSequenceNumber: number, traces: ITrace[]);

    updateMinSequenceNumber(value: number);

}

export interface IDocument {
    id: string;

    clientId: string;

    options: Object;

    attach(object: ICollaborativeObject): IDistributedObjectServices;

    get(id: string): ICollaborativeObject;

    submitObjectMessage(envelope: IEnvelope);

    // TODO Should I hide this internally on the message - doesn't seem to be a primary object
    submitLatencyMessage(message: ILatencyMessage);
}

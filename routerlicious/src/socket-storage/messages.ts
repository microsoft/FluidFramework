import * as api from "../api";

/**
 * Message sent to connect to the given object
 */
export interface IConnect {
    // The document that is being connected to
    id: string;
}

/**
 * Message sent to indicate a client has connected to the server
 */
export interface IConnected {
    // The client who is sending the message
    clientId: string;

    // Whether or not this is an existing object
    existing: boolean;

    // Available revisions for this document
    version: string;

    // The latest sequence number for the document
    sequenceNumber: number;

    // Distributed objects contained within the document
    distributedObjects: api.IDistributedObject[];

    // Pending deltas that have not yet been included in a snapshot
    pendingDeltas: api.ISequencedDocumentMessage[];
}

/**
 * Message sent to connect to the given object
 */
export interface IWorker {
    // Worker Id.
    clientId: string;

    // Type
    type: string;
}

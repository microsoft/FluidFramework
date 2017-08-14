import * as api from "../api";

/**
 * Message sent to connect to the given object
 */
export interface IConnect {
    // The document that is being connected to
    id: string;

    // The requested private key for decrypting deltas for the given object
    privateKey: string;

    // The requested public key for encrypting deltas to the given object
    publicKey: string;

    // Flag indicating whether encryption has been requested
    encrypted: boolean;
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

    // The minimum sequence number for the document
    minimumSequenceNumber: number;

    // Distributed objects contained within the document
    distributedObjects: api.IDistributedObject[];

    // The transformed messages between the minimum sequence number and
    // sequenceNumber
    transformedMessages: api.ISequencedDocumentMessage[];

    // Pending deltas that have not yet been included in a snapshot
    pendingDeltas: api.ISequencedDocumentMessage[];

    // The true private key for use by the client to decrypt deltas from the server
    privateKey: string;

    // The true public key for use by the client to send encrypted deltas to the server
    publicKey: string;

    // Flag indicating whether encryption is active
    encrypted: boolean;
}

/**
 * Message sent to indicate that a shadow client has connected to the server.
 */
export interface IShadowConnected {
    // The client who is sending the message
    clientId: string;
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

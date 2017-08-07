// Delta operation application type
export const OperationType = "op";

// Type representing a minimum sequence number update
export const MinimumSequenceNumberUpdateType = "msn";

// Empty operation message. Used to send an updated reference sequence number.
export const NoOp = "noop";

// Operation performed on a distributed data type
export const ObjectOperation = "objOp";

// Attaches a new object to the document
export const AttachObject = "attach";

/**
 * An envelope wraps the contents with the intended target
 */
export interface IEnvelope {
    // The target for the envelope
    address: string;

    // The contents of the envelope
    contents: any;
}

/**
 * Message related to a distributed data type
 */
export interface IObjectMessage {
    // The object's client sequence number
    clientSequenceNumber: number;

    // The reference object sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of message for the object
    type: string;

    // The operation to perform on the object
    contents: any;
}

/**
 * Sequenced message for a distributed data type
 */
export interface ISequencedObjectMessage {
    // The sequenced identifier
    sequenceNumber: number;

    // The minimum sequence number for all connected clients
    minimumSequenceNumber: number;

    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The client ID that submitted the delta
    clientId: string;

    // The type of operation
    type: string;

    // The contents of the message
    contents: any;
}

export interface IAttachMessage {
    // The identifier for the object
    id: string;

    // The type of object
    type: string;
}

/**
 * Document specific message
 */
export interface IDocumentMessage {
    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of document message being sent
    type: string;

    // The contents of the message
    contents: any;
}

/**
 * Sequenced message for a distribute document
 */
export interface ISequencedDocumentMessage {
    // The user that submitted the delta
    userId: string;

    // The client ID that submitted the delta
    clientId: string;

    // The sequenced identifier
    sequenceNumber: number;

    // The minimum sequence number for all connected clients
    minimumSequenceNumber: number;

    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of operation
    type: string;

    // The contents of the message
    contents: any;
}

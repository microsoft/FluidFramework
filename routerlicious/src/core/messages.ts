import * as api from "../api";

// String identifying the update reference sequence number message
export const UpdateReferenceSequenceNumberType = "UpdateReferenceSequenceNumber";

// String identifying the raw operation message
export const RawOperationType = "RawOperation";

// String identifying the sequenced operation message
export const SequencedOperationType = "SequencedOperation";

/**
 * Base class for messages placed on the distributed log
 */
export interface IMessage {
    // The type of the message
    type: string;
}

/**
 * Message relating to an object
 */
export interface IObjectMessage extends IMessage {
    // The user who submitted the message
    userId: string;

    // The object the message is intended for
    documentId: string;

    // The client who submitted the message
    clientId: string;

    // The time the server received the message, in milliseconds elapsed since
    // 1 January 1970 00:00:00 UTC, with leap seconds ignored.
    timestamp: number;
}

/**
 * Message sent when a client is updating their sequence number directly
 */
export interface IUpdateReferenceSequenceNumberMessage extends IObjectMessage {
    // The sequence number that is being updated
    sequenceNumber: number;
}

/**
 * Raw message inserted into the event hub queue
 */
export interface IRawOperationMessage extends IObjectMessage {
    // The message that was submitted
    operation: api.IDocumentMessage;
}

export interface ITicketedMessage extends IMessage {
    // The object the message is intended for
    documentId: string;
}

/**
 * A sequenced operation
 */
export interface ISequencedOperationMessage extends ITicketedMessage {
    // The sequenced operation
    operation: api.ISequencedDocumentMessage;
}

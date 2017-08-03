// Delta operation application type
export const OperationType = "op";

// Type representing a minimum sequence number update
export const MinimumSequenceNumberUpdateType = "msn";

export interface ISendPosition {
    clientSequenceNumber: number;

    referenceSequenceNumber: number;
}

/**
 * Base collaborative object message
 */
export interface IMessageBase {
    document: ISendPosition;

    object: ISendPosition;

    op: any;
}

/**
 * Message sent when a new operation is submitted to the server
 */
export interface IMessage extends IMessageBase {
}

export interface ISequencedPosition extends ISendPosition {
    sequenceNumber: number;

    minimumSequenceNumber: number;
}

export interface IBase {
    // The sequence number for the document
    document: ISequencedPosition;

    // The sequence number for the object
    object: ISequencedPosition;

    // The type of operation
    type: string;

    // Identifier for the distributed object the message applies to
    objectId: string;

    op: any;
}

/**
 * Message sent to clients when an operation has been assigned a sequence number and is being routed to clients
 */
export interface ISequencedMessage extends IBase {
    // The user that submitted the delta
    userId: string;

    // The client ID that submitted the delta
    clientId: string;
}

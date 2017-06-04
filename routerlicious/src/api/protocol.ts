/**
 * Base collaborative object message
 */
export interface IMessageBase {
    clientSequenceNumber: number;

    referenceSequenceNumber: number;

    op: any;
}

/**
 * Message sent when a new operation is submitted to the server
 */
export interface IMessage extends IMessageBase {
}

export interface IBase {
    // The sequence number for the message
    sequenceNumber: number;

    // The minimum sequence number for the message
    minimumSequenceNumber: number;

    // The type of operation
    type: string;
}

// Delta operation application type
export const OperationType = "op";

// Type representing a minimum sequence number update
export const MinimumSequenceNumberUpdateType = "msn";

/**
 * Message sent to clients when an operation has been assigned a sequence number and is being routed to clients
 */
export interface ISequencedMessage extends IMessageBase, IBase {
    // The user that submitted the delta
    userId: string;

    // The client ID that submitted the delta
    clientId: string;

    // The assigned sequence number
    sequenceNumber: number;

    // Minimum sequence number of connected clients
    minimumSequenceNumber: number;
}

export interface IDelta {
}

export const enum MergeTreeMsgType {
    INSERT,
    REMOVE,
}

export interface IMergeTreeDeltaMsg extends IDelta {
    /**
     * Type of this change.
     */
    type: MergeTreeMsgType;
    pos1: number;
    props?: Object;
    pos2?: number;
    text?: string;
}

export interface IPropertyString {
    props?: Object;
    text: string;
}

// tslint:disable-next-line:interface-name
export interface MergeTreeChunk {
    chunkStartSegmentIndex: number;
    chunkSegmentCount: number;
    chunkLengthChars: number;
    totalLengthChars: number;
    totalSegmentCount: number;
    chunkSequenceNumber: number;
    segmentTexts: IPropertyString[];
}

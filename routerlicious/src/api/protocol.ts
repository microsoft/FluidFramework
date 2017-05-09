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

/**
 * Message sent to clients when an operation has been assigned a sequence number and is being routed to clients
 */
export interface ISequencedMessage extends IMessageBase {
    // The user that submitted the delta
    userId: string;

    // The client ID that submitted the delta
    clientId: string;

    // The assigned sequence number
    sequenceNumber: number;

    // Minimum sequence number of connected clients
    minimumSequenceNumber: number;
}

// TODO need to consolidate the above with the IDeltaMessage below

export interface IDeltaMessage {
    clientId: string;

    sequenceNumber: number;

    clientSequenceNumber: number;

    referenceSequenceNumber: number;

    minimumSequenceNumber?: number;

    // The collaborative object the operation is intended for
    objectId: string;

    op: IDelta;
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
    pos2?: number;
    text?: string;
}

// tslint:disable-next-line:interface-name
export interface MergeTreeChunk {
    chunkStartSegmentIndex: number;
    chunkSegmentCount: number;
    chunkLengthChars: number;
    totalLengthChars: number;
    totalSegmentCount: number;
    chunkSequenceNumber: number;
    segmentTexts: string[];
    // TODO: segment properties key
}

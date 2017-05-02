/**
 * Base collaborative object message
 */
export interface IMessageBase {
    clientSequenceNumber: number;

    referenceSequenceNumber: number;

    minimumSequenceNumber: number;

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
}

export interface IDelta {
}

export const enum SegTreeMsgType {
    INSERT,
    REMOVE,
}

export interface ISegTreeDeltaMsg extends IDelta {
    /**
     * Type of this change.
     */
    type: SegTreeMsgType;
    pos1: number;
    pos2?: number;
    text?: string;
}

// Is there a doc comment genrator for TS?

export interface IMessageBase {
    clientId: string;

    clientSequenceNumber: number;

    referenceSequenceNumber: number;

    minimumSequenceNumber: number;

    // The collaborative object the operation is intended for
    objectId: string;

    op: IDelta;
}

export interface IMessage extends IMessageBase {
}

export interface ISequencedMessage extends IMessageBase {
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

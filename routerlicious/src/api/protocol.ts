// Is there a doc comment genrator for TS?

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

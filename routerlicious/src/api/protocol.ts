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

export interface IMergeTreeMsg extends IMessage {
    op: IMergeTreeDelta;
}

export enum MarkerBehaviors {
    None =              0x0,
    Tile =              0x1,
    Range =             0x2,
    Begin =             0x4,
    End =               0x10,
}

export interface IMarkerDef {
    type: string;
    behaviors?: MarkerBehaviors;
    end?: number;
}

export interface IComponentDef {
    url: string;
}

export const enum MergeTreeDeltaType {
    INSERT,
    REMOVE,
    ASSIGN,
    GROUP,
}

export interface IMergeTreeDelta extends IDelta {
    /**
     * Type of this change.
     */
    type: MergeTreeDeltaType;
}

export interface IMergeTreeInsertMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.INSERT;
    pos1: number;
    props?: Object;
    text?: string;
    marker?: IMarkerDef;
    component?: IComponentDef;
}

export interface IMergeTreeRemoveMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.REMOVE;
    pos1: number;
    pos2?: number;
    marker?: IMarkerDef;
}

export interface IMergeTreeAssignMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.ASSIGN;
    pos1: number;
    props: Object;
    pos2?: number;
    marker?: IMarkerDef;
}

export interface IMergeTreeGroupMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.GROUP;
    ops: IMergeTreeDelta[];
}

export type IMergeTreeOp = IMergeTreeInsertMsg | IMergeTreeRemoveMsg | IMergeTreeAssignMsg | IMergeTreeGroupMsg;

export interface IPropertyString {
    props?: Object;
    text?: string;
    marker?: IMarkerDef;
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

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

// Delta operation application type
export const OperationType = "op";

// Type representing a minimum sequence number update
export const MinimumSequenceNumberUpdateType = "msn";

/**
 * Message sent to clients when an operation has been assigned a sequence number and is being routed to clients
 */
export interface ISequencedMessage extends IBase {
    // The user that submitted the delta
    userId: string;

    // The client ID that submitted the delta
    clientId: string;
}

// TODO I probably need to distinguish document vs. object events

export interface IDelta {
}

export interface IMergeTreeMsg extends IMessage {
    op: IMergeTreeDelta;
}

export enum MarkerBehaviors {
    None =              0x0,
    PropagatesForward = 0x1,
    Tile =              0x2,
    Begin =             0x4,
    End =               0x10,
    Region =            0x20,
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

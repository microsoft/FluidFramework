import * as api from "../api";

export interface IMergeTreeMsg extends api.IMessage {
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

export interface IMergeTreeDelta {
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

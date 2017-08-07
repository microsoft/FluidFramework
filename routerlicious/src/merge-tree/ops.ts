export enum MarkerBehaviors {
    None =     0x0,
    Tile =     0x1,
    Range =    0x2,
    Begin =    0x4,
    End =      0x10,
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
    ANNOTATE,
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

export interface IMergeTreeAnnotateMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.ANNOTATE;
    pos1: number;
    props: Object;
    pos2?: number;
    marker?: IMarkerDef;
}

export interface IMergeTreeGroupMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.GROUP;
    ops: IMergeTreeDelta[];
}

export type IMergeTreeOp = IMergeTreeInsertMsg | IMergeTreeRemoveMsg | IMergeTreeAnnotateMsg | IMergeTreeGroupMsg;

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

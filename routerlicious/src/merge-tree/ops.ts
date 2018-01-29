// tslint:disable:no-bitwise
export enum MarkerBehaviors {
    None =          0x0,
    Tile =          0x1,
    RangeBegin =    0x2,
    RangeEnd =      0x4,
    SlideOnRemove = 0x10,
}

export interface IMarkerDef {
    behaviors?: MarkerBehaviors;
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

/**
 * A segment-relative position.
 */
export interface IMarkerPosition {
    /**
     * String identifier specifying a segment.
     */
    id: string;
    /**
     * If true, insert before the specified segment.  If false or not defined,
     * insert after the specified segment.
     */
    before?: boolean;
    /**
     * A positive number >= 1.  If before is false, offset is added to the position.
     * If before is true, offset is subtracted from the position.
     */
    offset?: number;
}

export interface IMergeTreeInsertMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.INSERT;
    pos1?: number;
    markerPos1?: IMarkerPosition;
    props?: Object;
    text?: string;
    marker?: IMarkerDef;
    component?: IComponentDef;
}

export interface IMergeTreeRemoveMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.REMOVE;
    pos1?: number;
    markerPos1?: IMarkerPosition;
    pos2?: number;
    markerPos2?: IMarkerPosition;
}

export interface ICombiningOp {
    name: string;
    defaultValue?: any;
    minValue?: any;
    maxValue?: any;
}

export interface IContingencyCheck {
    props: Object;
}

export interface IMergeTreeAnnotateMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.ANNOTATE;
    pos1?: number;
    markerPos1?: IMarkerPosition;
    pos2?: number;
    markerPos2?: IMarkerPosition;
    props: Object;
    combiningOp?: ICombiningOp;
    when?: IContingencyCheck;
}

export interface IMergeTreeGroupMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.GROUP;
    hasContingentOps?: boolean;
    ops: IMergeTreeOp[];
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

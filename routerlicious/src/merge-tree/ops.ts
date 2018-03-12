// tslint:disable:no-bitwise
export enum ReferenceType {
    Simple =        0x0,
    Tile =          0x1,
    NestBegin =     0x2,
    NestEnd =       0x4,
    RangeBegin =    0x10,
    RangeEnd =      0x20,
    SlideOnRemove = 0x40,
}

export enum IntervalType {
    Simple = 0x0,
    Nest =    0x1,
    SlideOnRemove = 0x2,
}

export interface IMarkerDef {
    refType?: ReferenceType;
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
 * A position specified relative to a segment or shared reference.
 */
export interface IRelativePosition {
    /**
     * True if the position is relative to a shared reference.  Otherwise,
     * the position is relative to a segment.
     */
    indirect?: boolean;
    /**
     * String identifier specifying a segment or shared reference.
     */
    id: string;
    /**
     * If true, insert before the specified segment or reference.  If false or not defined,
     * insert after the specified segment or reference.
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
    relativePos1?: IRelativePosition;
    props?: Object;
    text?: string;
    marker?: IMarkerDef;
}

export interface IMergeTreeRemoveMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.REMOVE;
    pos1?: number;
    relativePos1?: IRelativePosition;
    pos2?: number;
    relativePos2?: IRelativePosition;
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
    markerPos1?: IRelativePosition;
    pos2?: number;
    markerPos2?: IRelativePosition;
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

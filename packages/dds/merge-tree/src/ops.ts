/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export enum ReferenceType {
    Simple = 0x0,
    Tile = 0x1,
    NestBegin = 0x2,
    NestEnd = 0x4,
    RangeBegin = 0x10,
    RangeEnd = 0x20,
    SlideOnRemove = 0x40,
    Transient = 0x100,
}

export enum IntervalType {
    Simple = 0x0,
    Nest = 0x1,
    SlideOnRemove = 0x2,
    Transient = 0x4,
}

export interface IMarkerDef {
    refType?: ReferenceType;
}

// Note: Assigned positive integers to avoid clashing with MergeTreeMaintenanceType
export const enum MergeTreeDeltaType {
    INSERT = 0,
    REMOVE = 1,
    ANNOTATE = 2,
    GROUP = 3,
}

export interface IMergeTreeDelta {
    /**
     * Type of this change.
     */
    type: MergeTreeDeltaType;
}

/**
 * A position specified relative to a segment.
 */
export interface IRelativePosition {
    /**
     * String identifier specifying a segment.
     */
    id?: string;
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
    relativePos1?: IRelativePosition;
    pos2?: number;
    relativePos2?: IRelativePosition;
    seg?: any;
    register?: string;
}

export interface IMergeTreeRemoveMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.REMOVE;
    pos1?: number;
    relativePos1?: IRelativePosition;
    pos2?: number;
    relativePos2?: IRelativePosition;
    register?: string;
}

export interface ICombiningOp {
    name: string;
    defaultValue?: any;
    minValue?: any;
    maxValue?: any;
}

export interface IMergeTreeAnnotateMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.ANNOTATE;
    pos1?: number;
    relativePos1?: IRelativePosition;
    pos2?: number;
    relativePos2?: IRelativePosition;
    props: Record<string, any>;
    combiningOp?: ICombiningOp;
}

export interface IMergeTreeGroupMsg extends IMergeTreeDelta {
    type: MergeTreeDeltaType.GROUP;
    ops: IMergeTreeDeltaOp[];
}

export interface IJSONSegment {
    props?: Record<string, any>;
}

export type IMergeTreeDeltaOp = IMergeTreeInsertMsg | IMergeTreeRemoveMsg | IMergeTreeAnnotateMsg;

export type IMergeTreeOp = IMergeTreeDeltaOp | IMergeTreeGroupMsg;

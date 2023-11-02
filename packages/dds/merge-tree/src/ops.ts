/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Flags enum that dictates behavior of a ReferencePosition
 */
export enum ReferenceType {
	Simple = 0x0,
	/**
	 * Allows this reference to be located using the `searchForMarker` API on merge-tree.
	 */
	Tile = 0x1,
	RangeBegin = 0x10,
	RangeEnd = 0x20,
	/**
	 * When a segment is marked removed (locally or with ack), this reference will slide to the first
	 * valid option of:
	 * 1. the start of the next furthest segment
	 * 2. the end of the next nearest segment
	 * 3. DetachedReferencePosition
	 */
	SlideOnRemove = 0x40,
	/**
	 * When a segment is marked removed (locally or with ack), this reference will remain on that segment.
	 */
	StayOnRemove = 0x80,
	/**
	 * Specifies that the reference position should never be added to the segment it refers to.
	 * This is useful for comparison/iteration purposes
	 */
	Transient = 0x100,
}

export interface IMarkerDef {
	refType?: ReferenceType;
}

// Note: Assigned positive integers to avoid clashing with MergeTreeMaintenanceType
export const MergeTreeDeltaType = {
	INSERT: 0,
	REMOVE: 1,
	ANNOTATE: 2,
	/**
	 * @deprecated The ability to create group ops will be removed in an upcoming release, as group ops are redundant with he native batching capabilities of the runtime
	 */
	GROUP: 3,
	OBLITERATE: 4,
} as const;

export type MergeTreeDeltaType = (typeof MergeTreeDeltaType)[keyof typeof MergeTreeDeltaType];

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
	 * A positive number \>= 1.  If before is false, offset is added to the position.
	 * If before is true, offset is subtracted from the position.
	 */
	offset?: number;
}

export interface IMergeTreeInsertMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.INSERT;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
	seg?: any;
}

export interface IMergeTreeRemoveMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.REMOVE;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
}

export interface IMergeTreeObliterateMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.OBLITERATE;
	pos1?: number;
	/**
	 * This field is currently unused, but we keep it around to make the union
	 * type of all merge-tree messages have the same fields
	 */
	relativePos1?: never;
	pos2?: number;
	/**
	 * This field is currently unused, but we keep it around to make the union
	 * type of all merge-tree messages have the same fields
	 */
	relativePos2?: never;
}

export interface ICombiningOp {
	name: string;
	defaultValue?: any;
	minValue?: any;
	maxValue?: any;
}

export interface IMergeTreeAnnotateMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.ANNOTATE;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
	props: Record<string, any>;
	combiningOp?: ICombiningOp;
}

/**
 * @deprecated The ability to create group ops will be removed in an upcoming
 * release, as group ops are redundant with the native batching capabilities
 * of the runtime
 */
export interface IMergeTreeGroupMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.GROUP;
	ops: IMergeTreeDeltaOp[];
}

export interface IJSONSegment {
	props?: Record<string, any>;
}

export type IMergeTreeDeltaOp =
	| IMergeTreeInsertMsg
	| IMergeTreeRemoveMsg
	| IMergeTreeAnnotateMsg
	| IMergeTreeObliterateMsg;

export type IMergeTreeOp = IMergeTreeDeltaOp | IMergeTreeGroupMsg;

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Flags enum that dictates behavior of a {@link ReferencePosition}
 * @legacy
 * @alpha
 */
export enum ReferenceType {
	Simple = 0x0,
	/**
	 * Allows this reference to be located using the `searchForMarker` API on merge-tree.
	 */
	Tile = 0x1,

	/**
	 * Denotes that this reference begins the start of an interval. This is
	 * generally not meaningful outside the context of interval collections
	 * on SharedString.
	 */
	RangeBegin = 0x10,

	/**
	 * Denotes that this reference is the end of an interval. This is
	 * generally not meaningful outside the context of interval collections
	 * on SharedString.
	 */
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

/**
 * @legacy
 * @alpha
 */
export interface IMarkerDef {
	refType?: ReferenceType;
}

// Note: Assigned positive integers to avoid clashing with MergeTreeMaintenanceType
/**
 * @legacy
 * @alpha
 */
export const MergeTreeDeltaType = {
	INSERT: 0,
	REMOVE: 1,
	ANNOTATE: 2,
	/**
	 * @deprecated The ability to create group ops will be removed in an upcoming release, as group ops are redundant with he native batching capabilities of the runtime
	 */
	GROUP: 3,
	OBLITERATE: 4,
	OBLITERATE_SIDED: 5,
} as const;

/**
 * @legacy
 * @alpha
 */
export type MergeTreeDeltaType = (typeof MergeTreeDeltaType)[keyof typeof MergeTreeDeltaType];

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeDelta {
	/**
	 * Type of this change.
	 */
	type: MergeTreeDeltaType;
}

/**
 * A position specified relative to a segment.
 * @legacy
 * @alpha
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

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeInsertMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.INSERT;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
	// The segment must be allowed to be of any type in order to acommodate converting from
	// JSON to a segment.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	seg?: any;
}

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeRemoveMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.REMOVE;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
}

/**
 * @deprecated We no longer intend to support this functionality and it will
 * be removed in a future release. There is no replacement for this
 * functionality.
 * @legacy
 * @alpha
 */
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

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeObliterateSidedMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.OBLITERATE_SIDED;
	pos1: { pos: number; before: boolean };
	/**
	 * This field is currently unused, but we keep it around to make the union
	 * type of all merge-tree messages have the same fields
	 */
	relativePos1?: never;
	pos2: { pos: number; before: boolean };
	/**
	 * This field is currently unused, but we keep it around to make the union
	 * type of all merge-tree messages have the same fields
	 */
	relativePos2?: never;
}

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeAnnotateMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.ANNOTATE;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	props: Record<string, any>;
	adjust?: never;
}

/**
 * Used to define per key adjustments in an {@link IMergeTreeAnnotateAdjustMsg}
 * @alpha
 * @legacy
 */
export interface AdjustParams {
	/**
	 * The adjustment delta which will be summed with the current value if it is a number,
	 * or summed with zero if the current value is not a number.
	 */
	delta: number;
	/**
	 * An optional minimum value for the computed value of the key this adjustment is applied to.
	 * The minimum will be applied after the value is applied.
	 */
	min?: number | undefined;
	/**
	 * An optional maximum value for the computed value of the key this adjustment is applied to.
	 * The maximum will be applied after the value is applied.
	 */
	max?: number | undefined;
}

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeAnnotateAdjustMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.ANNOTATE;
	pos1?: number;
	pos2?: number;
	relativePos1?: undefined;
	relativePos2?: undefined;
	props?: never;
	adjust: Record<string, AdjustParams>;
}

/**
 * @deprecated The ability to create group ops will be removed in an upcoming
 * release, as group ops are redundant with the native batching capabilities
 * of the runtime
 *
 * @legacy
 * @alpha
 */
export interface IMergeTreeGroupMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.GROUP;
	ops: IMergeTreeDeltaOp[];
}

/**
 * @legacy
 * @alpha
 */
export interface IJSONSegment {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	props?: Record<string, any>;
}

/**
 * @legacy
 * @alpha
 */
export type IMergeTreeDeltaOp =
	| IMergeTreeInsertMsg
	| IMergeTreeRemoveMsg
	| IMergeTreeAnnotateMsg
	| IMergeTreeAnnotateAdjustMsg
	| IMergeTreeObliterateMsg
	| IMergeTreeObliterateSidedMsg;

/**
 * @legacy
 * @alpha
 */
export type IMergeTreeOp = IMergeTreeDeltaOp | IMergeTreeGroupMsg;

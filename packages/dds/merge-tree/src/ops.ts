/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Flags enum that dictates behavior of a {@link ReferencePosition}
 * @alpha
 */
export enum ReferenceType {
	Simple = 0x0,
	/**
	 * Allows this reference to be located using the `findTile` API on merge-tree.
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
 * @alpha
 */
export interface IMarkerDef {
	refType?: ReferenceType;
}

// Note: Assigned positive integers to avoid clashing with MergeTreeMaintenanceType
/**
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
} as const;

/**
 * @alpha
 */
export type MergeTreeDeltaType = (typeof MergeTreeDeltaType)[keyof typeof MergeTreeDeltaType];

/**
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
 * @alpha
 */
export interface IMergeTreeInsertMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.INSERT;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
	seg?: any;
}

/**
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
 * @alpha
 */
export interface IMergeTreeAnnotateMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.ANNOTATE;
	pos1?: number;
	relativePos1?: IRelativePosition;
	pos2?: number;
	relativePos2?: IRelativePosition;
	props: Record<string, any>;
}

/**
 * @deprecated The ability to create group ops will be removed in an upcoming
 * release, as group ops are redundant with the native batching capabilities
 * of the runtime
 *
 * @alpha
 */
export interface IMergeTreeGroupMsg extends IMergeTreeDelta {
	type: typeof MergeTreeDeltaType.GROUP;
	ops: IMergeTreeDeltaOp[];
}

/**
 * @alpha
 */
export interface IJSONSegment {
	props?: Record<string, any>;
}

/**
 * @alpha
 */
export type IMergeTreeDeltaOp =
	| IMergeTreeInsertMsg
	| IMergeTreeRemoveMsg
	| IMergeTreeAnnotateMsg
	| IMergeTreeObliterateMsg;

/**
 * @alpha
 */
export type IMergeTreeOp = IMergeTreeDeltaOp | IMergeTreeGroupMsg;

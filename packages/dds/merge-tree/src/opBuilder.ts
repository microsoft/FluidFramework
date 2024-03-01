/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment, Marker } from "./mergeTreeNodes.js";
import {
	IMergeTreeAnnotateMsg,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeGroupMsg,
	IMergeTreeInsertMsg,
	IMergeTreeRemoveMsg,
	MergeTreeDeltaType,
	IMergeTreeDeltaOp,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeObliterateMsg,
} from "./ops.js";
import { PropertySet } from "./properties.js";

/**
 * Creates the op for annotating the markers with the provided properties
 * @param marker - The marker to annotate
 * @param props - The properties to annotate the marker with
 * @returns The annotate op
 *
 * @internal
 */
export function createAnnotateMarkerOp(
	marker: Marker,
	props: PropertySet,
): IMergeTreeAnnotateMsg | undefined {
	const id = marker.getId();
	if (!id) {
		return undefined;
	}

	return {
		props,
		relativePos1: { id, before: true },
		relativePos2: { id },
		type: MergeTreeDeltaType.ANNOTATE,
	};
}

/**
 * Creates the op for annotating the range with the provided properties
 * @param start - The inclusive start position of the range to annotate
 * @param end - The exclusive end position of the range to annotate
 * @param props - The properties to annotate the range with
 * @returns The annotate op
 *
 * @internal
 */
export function createAnnotateRangeOp(
	start: number,
	end: number,
	props: PropertySet,
): IMergeTreeAnnotateMsg {
	return {
		pos1: start,
		pos2: end,
		props,
		type: MergeTreeDeltaType.ANNOTATE,
	};
}

/**
 * Creates the op to remove a range
 *
 * @param start - The inclusive start of the range to remove
 * @param end - The exclusive end of the range to remove
 *
 * @internal
 */
export function createRemoveRangeOp(start: number, end: number): IMergeTreeRemoveMsg {
	return {
		pos1: start,
		pos2: end,
		type: MergeTreeDeltaType.REMOVE,
	};
}

/**
 * Creates the op to obliterate a range
 *
 * @param start - The inclusive start of the range to obliterate
 * @param end - The exclusive end of the range to obliterate
 *
 * @internal
 */
// eslint-disable-next-line import/no-deprecated
export function createObliterateRangeOp(start: number, end: number): IMergeTreeObliterateMsg {
	return {
		pos1: start,
		pos2: end,
		type: MergeTreeDeltaType.OBLITERATE,
	};
}

/**
 *
 * @param pos - The position to insert the segment at
 * @param segment - The segment to insert
 *
 * @internal
 */
export function createInsertSegmentOp(pos: number, segment: ISegment): IMergeTreeInsertMsg {
	return createInsertOp(pos, segment.toJSONObject());
}

/**
 * @internal
 */
export function createInsertOp(pos: number, segSpec: any): IMergeTreeInsertMsg {
	return {
		pos1: pos,
		seg: segSpec,
		type: MergeTreeDeltaType.INSERT,
	};
}

/**
 *
 * @param ops - The ops to group
 *
 * @deprecated The ability to create group ops will be removed in an upcoming
 * release, as group ops are redundant with he native batching capabilities of
 * the runtime
 *
 * @deprecated The ability to create group ops will be removed in an upcoming release, as group ops are redundant with he native batching capabilities of the runtime
 * @internal
 */
// eslint-disable-next-line import/no-deprecated
export function createGroupOp(...ops: IMergeTreeDeltaOp[]): IMergeTreeGroupMsg {
	return {
		ops,
		type: MergeTreeDeltaType.GROUP,
	};
}

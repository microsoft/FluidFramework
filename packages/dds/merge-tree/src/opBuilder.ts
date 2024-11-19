/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment, Marker } from "./mergeTreeNodes.js";
import {
	IMergeTreeAnnotateMsg,
	IMergeTreeDeltaOp,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeGroupMsg,
	IMergeTreeInsertMsg,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeObliterateMsg,
	IMergeTreeRemoveMsg,
	MergeTreeDeltaType,
	type AdjustParams,
	type IMergeTreeAnnotateAdjustMsg,
	type IMergeTreeObliterateSidedMsg,
} from "./ops.js";
import { PropertySet, type MapLike } from "./properties.js";
import { normalizePlace, Side, type SequencePlace } from "./sequencePlace.js";

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
		props: { ...props },
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
		props: { ...props },
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
export function createAdjustRangeOp(
	start: number,
	end: number,
	adjust: MapLike<AdjustParams>,
): IMergeTreeAnnotateAdjustMsg {
	return {
		pos1: start,
		pos2: end,
		adjust: { ...adjust },
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
 * Creates the op to obliterate a range
 *
 * @param start - The start of the range to obliterate.
 * If a number is provided, the range will start before that index.
 * @param end - The end of the range to obliterate.
 * If a number is provided, the range will end after that index -1.
 * This preserves the previous behavior of not expanding obliteration ranges at the endpoints
 * for uses which predate the availability of endpoint expansion.
 *
 * @internal
 */
export function createObliterateRangeOpSided(
	start: SequencePlace,
	end: SequencePlace,
): IMergeTreeObliterateSidedMsg {
	const startPlace = normalizePlace(start);
	// If a number is provided, default to after the previous index.
	// This preserves the behavior of obliterate prior to the introduction of endpoint expansion.
	const endPlace =
		typeof end === "number"
			? { pos: end - 1, side: Side.After } // default to inclusive bounds
			: normalizePlace(end);
	return {
		type: MergeTreeDeltaType.OBLITERATE_SIDED,
		pos1: { pos: startPlace.pos, before: startPlace.side === Side.Before },
		pos2: { pos: endPlace.pos, before: endPlace.side === Side.Before },
	};
}

/**
 * Creates an op for inserting a segment at the specified position.
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
 * Creates the op for inserting a segment from its JSON representation at
 * the specified position.
 *
 * @internal
 */
export function createInsertOp(pos: number, segSpec: unknown): IMergeTreeInsertMsg {
	return {
		pos1: pos,
		seg: segSpec,
		type: MergeTreeDeltaType.INSERT,
	};
}

/**
 * Creates a group op from the provided ops.
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

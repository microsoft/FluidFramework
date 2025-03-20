/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { ISegment } from "./mergeTreeNodes.js";
// eslint-disable-next-line import/no-deprecated
import { IMergeTreeGroupMsg, IMergeTreeOp, MergeTreeDeltaType } from "./ops.js";
import { PropertySet } from "./properties.js";

/**
 * @legacy
 * @alpha
 */
export type MergeTreeDeltaOperationType =
	| typeof MergeTreeDeltaType.ANNOTATE
	| typeof MergeTreeDeltaType.INSERT
	| typeof MergeTreeDeltaType.REMOVE
	| typeof MergeTreeDeltaType.OBLITERATE;

/**
 * Enum-like constant defining the types of "maintenance" events on a merge tree.
 * Maintenance events correspond to structural segment changes or acks of pending segments.
 *
 * Note: these values are assigned negative integers to avoid clashing with `MergeTreeDeltaType`.
 * @legacy
 * @alpha
 */
export const MergeTreeMaintenanceType = {
	/**
	 * Notification that a segment "append" has occurred, i.e. two adjacent segments have been merged.
	 * BEWARE: `deltaSegments` on the corresponding event will contain both the merged segment and the latter
	 * segment, pre-merge.
	 * For example, if the merge tree originally had two adjacent segments [A][B] and called A.append(B) to get
	 * segment [AB], `deltaSegments` would contain [AB] and [B].
	 */
	APPEND: -1,
	/**
	 * Notification that a segment has been split in two.
	 * `deltaSegments` on the corresponding event will contain the resulting two segments.
	 */
	SPLIT: -2,
	/**
	 * Notification that a segment has been unlinked (i.e. removed) from the MergeTree.
	 * This occurs on leaf segments during Zamboni when the segment's tracking collection is empty
	 * (e.g., not being tracked for undo/redo).
	 * It also occurs on internal merge tree segments when re-packing children to maintain tree balancing invariants.
	 */
	UNLINK: -3,
	/**
	 * Notification that a local change has been acknowledged by the server.
	 * This means that it has made the round trip to the server and has had a sequence number assigned.
	 */
	ACKNOWLEDGED: -4,
} as const;
/**
 * @legacy
 * @alpha
 */
export type MergeTreeMaintenanceType =
	(typeof MergeTreeMaintenanceType)[keyof typeof MergeTreeMaintenanceType];

/**
 * @legacy
 * @alpha
 */
export type MergeTreeDeltaOperationTypes =
	| MergeTreeDeltaOperationType
	| MergeTreeMaintenanceType;

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeDeltaCallbackArgs<
	TOperationType extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationType,
> {
	/**
	 * The type of operation that affected segments in the merge-tree.
	 * The affected segments can be accessed via {@link IMergeTreeDeltaCallbackArgs.deltaSegments|deltaSegments}.
	 *
	 * See {@link MergeTreeDeltaOperationType} and {@link (MergeTreeMaintenanceType:type)} for possible values.
	 */
	readonly operation: TOperationType;

	/**
	 * A list of deltas describing actions taken on segments.
	 *
	 * Deltas are not guaranteed to be in any particular order.
	 */
	readonly deltaSegments: IMergeTreeSegmentDelta[];
}

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeSegmentDelta {
	/**
	 * The segment this delta affected.
	 */
	segment: ISegment;

	/**
	 * A property set containing changes to properties on this segment.
	 *
	 * @remarks - Deleting a property is represented using `null` as the value.
	 * @example
	 *
	 * An annotation change which deleted the property "foo" and set "bar" to 5 would be represented as:
	 * `{ foo: null, bar: 5 }`.
	 */
	propertyDeltas?: PropertySet;
}

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeDeltaOpArgs {
	/**
	 * The group op which contains the operation
	 * if there operation is part of a group op.
	 */
	// eslint-disable-next-line import/no-deprecated
	readonly groupOp?: IMergeTreeGroupMsg;

	/**
	 * The {@link IMergeTreeOp} corresponding to the delta.
	 *
	 * @remarks - This is useful for determining the type of change (see {@link (MergeTreeDeltaType:type)}).
	 */
	readonly op: IMergeTreeOp;

	/**
	 * The {@link @fluidframework/protocol-definitions#ISequencedDocumentMessage} corresponding to this acknowledged change.
	 *
	 * This field is omitted for deltas corresponding to unacknowledged changes.
	 */
	readonly sequencedMessage?: ISequencedDocumentMessage;
}

/**
 * @internal
 */
export type MergeTreeDeltaCallback = (
	opArgs: IMergeTreeDeltaOpArgs,
	deltaArgs: IMergeTreeDeltaCallbackArgs,
) => void;

/**
 * @legacy
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IMergeTreeMaintenanceCallbackArgs
	extends IMergeTreeDeltaCallbackArgs<MergeTreeMaintenanceType> {}

/**
 * @internal
 */
export type MergeTreeMaintenanceCallback = (
	MaintenanceArgs: IMergeTreeMaintenanceCallbackArgs,
	opArgs: IMergeTreeDeltaOpArgs | undefined,
) => void;

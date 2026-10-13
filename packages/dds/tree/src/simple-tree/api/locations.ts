/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";

import type { TreeNode } from "../core/index.js";
import type { TreeArrayNode } from "../node-kinds/index.js";

/**
 * An opaque, serializable identifier for a sequenced state of the main branch.
 * @remarks
 * Obtained as part of {@link TreeLocationResolver.capture}.
 * Tokens expire with retained history and must not be used for persisted locations.
 * @alpha
 */
export type TreePositionRevision = string &
	ErasedType<"@fluidframework/tree.TreePositionRevision">;

/**
 * An opaque, serializable reference to a node at a captured revision.
 * @remarks
 * Only meaningful with the revision and SharedTree branch from its {@link CapturedTreeLocations}.
 * This is not a persistent identifier or a live tracking reference.
 * Applications may transmit this string through JSON, but must not construct, parse, or modify its encoding.
 * @alpha
 */
export type TreeNodeReference = string & ErasedType<"@fluidframework/tree.TreeNodeReference">;

/**
 * A whole node, or a gap between elements of an array, in the current local view.
 * @remarks
 * A node location can refer to any SimpleTree {@link TreeNode}, including an entire array.
 * Primitive leaf values do not identify a particular occurrence and are not node locations.
 * Sequence indices count array elements, not UTF-16 units or grapheme clusters unless the schema uses those units.
 * @alpha
 */
export type TreeLocation =
	| {
			readonly kind: "node";
			readonly node: TreeNode;
	  }
	| {
			readonly kind: "sequence";
			readonly node: TreeArrayNode;
			/**
			 * A gap index from zero through the array length, inclusive.
			 */
			readonly index: number;
			/**
			 * The side of content inserted at the gap on which the position stays.
			 * At move boundaries, "before" follows the preceding element and "after" follows the following element.
			 * Array boundaries provide sentinels when there is no adjacent element.
			 */
			readonly affinity: "before" | "after";
	  };

/**
 * A serializable location expressed entirely in a captured revision's coordinates.
 * @remarks
 * Created by {@link TreeLocationResolver.capture}, not by looking up a node on the receiving client.
 * @alpha
 */
export type CapturedTreeLocation =
	| {
			readonly kind: "node";
			readonly node: TreeNodeReference;
	  }
	| {
			readonly kind: "sequence";
			readonly node: TreeNodeReference;
			readonly index: number;
			readonly affinity: "before" | "after";
	  };

/**
 * An ordered batch of locations captured at one sequenced revision.
 * @remarks
 * The whole batch can be transmitted through JSON.
 * Keep references paired with their captured revision.
 * @alpha
 */
export interface CapturedTreeLocations {
	/**
	 * The main branch's sequenced state in which all locations were captured.
	 */
	readonly revision: TreePositionRevision;
	/**
	 * The captured node selections and sequence gaps, in input order.
	 */
	readonly locations: readonly CapturedTreeLocation[];
}

/**
 * The current local location or an explicit unavailable result.
 * @remarks
 * Node locations follow node identity through moves; deletion does not select a replacement.
 * Deletion is terminal for a captured node location, even if a later undo restores the node.
 * Sequence locations follow moved content, including into another array.
 * Deletions collapse sequence gaps to the deletion boundary.
 * @alpha
 */
export type ResolvedTreeLocation =
	| {
			readonly status: "resolved";
			readonly location: TreeLocation;
	  }
	| {
			readonly status: "unavailable";
			readonly reason: "target-deleted" | "invalid-location";
	  };

/**
 * Resolution results in capture order, or an unavailable source revision.
 * @remarks
 * An unavailable revision can be not yet received, expired, or from a different branch.
 * Retry after applying pending inbound operations, or request a fresh capture if the revision has expired.
 * @alpha
 */
export type TreeLocationResolution =
	| {
			readonly status: "resolved";
			readonly locations: readonly ResolvedTreeLocation[];
	  }
	| {
			readonly status: "revision-unavailable";
	  };

/**
 * Captures and resolves ephemeral node selections and sequence positions.
 * @remarks
 * Capture uses the sender's SimpleTree objects; resolution returns the receiver's SimpleTree objects.
 * No application-level node lookup is required on the receiving client.
 * This prototype supports only the main view of an attached SharedTree, not local forks or other shared branches.
 * Resolution includes pending local edits and replays the intervening retained history using sparse anchors.
 * It does not reconstruct a historical forest, retain history, or create live tracking references for callers.
 * Replay cost is linear in the intervening changes and depends on the number of locations.
 * Schema changes do not change node identity or location and are skipped during replay.
 * The receiving view must be compatible with the current stored schema.
 * @sealed @alpha
 */
export interface TreeLocationResolver {
	/**
	 * Captures locations and their revision from the same sequenced state.
	 * @param locations - Local node selections or sequence gaps, in application-defined order.
	 * @returns A serializable capture.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if any of the limitations below are violated,
	 * a location is invalid, a node is outside this view's document, or the view is disposed.
	 * @remarks
	 * This initial prototype has the following limitations:
	 *
	 * - Only the main view of an attached SharedTree is supported. Local forks, independent views,
	 * and non-main shared branches are not supported, even when they have no pending edits.
	 * - The main view must have a sequenced revision and no pending local edits.
	 * Wait for local edits to be acknowledged before calling this method.
	 * - No transaction may be open, including a transaction that has not made any edits.
	 * - Node locations require SimpleTree nodes; primitive leaf values cannot identify a particular occurrence.
	 * Sequence locations require array nodes and count array elements, not arbitrary text offsets.
	 *
	 * Unsupported view states throw rather than returning undefined.
	 * After waiting for acknowledgement, recompute the selection and capture it synchronously;
	 * do not reuse indices measured before the wait.
	 * Captures are ephemeral and expire with retained history; they are not persistent anchors.
	 */
	capture(locations: readonly TreeLocation[]): CapturedTreeLocations;

	/**
	 * Resolves a captured batch into this view's current local state.
	 * @param capture - The sender's capture, including its revision and opaque node references.
	 * @returns Results in capture order or an explicit unavailable-revision result.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} on a view other than the main view of an attached SharedTree,
	 * during a transaction, after disposal, or if the receiving view cannot view the current stored schema.
	 * @remarks
	 * Unlike capture, resolution supports pending local edits on the main view.
	 * Not-yet-received, expired, or wrong-context revisions return `revision-unavailable`; these are not usage errors.
	 * Wait for editor-model updates before using the result in an editor.
	 * Wire encodings are checked, but captures are not authenticated proofs of historical node existence.
	 */
	resolve(capture: CapturedTreeLocations): TreeLocationResolution;
}

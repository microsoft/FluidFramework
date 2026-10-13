/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";

import type { TreeNode } from "../core/index.js";
import type { TreeArrayNode } from "../node-kinds/index.js";

/**
 * An opaque, serializable identifier for a sequenced state of a shared branch.
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
	 * The shared branch's sequenced state in which all locations were captured.
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
			readonly reason: "target-deleted" | "invalid-location" | "unsupported-change";
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
 * Resolution includes pending local edits and replays the intervening retained history using sparse anchors.
 * It does not reconstruct a historical forest, retain history, or create live tracking references for callers.
 * Replay cost is linear in the intervening changes and depends on the number of locations.
 * Locations crossing schema changes are reported as unsupported.
 * @sealed @alpha
 */
export interface TreeLocationResolver {
	/**
	 * Captures locations and their revision from the same sequenced state.
	 * @param locations - Local node selections or sequence gaps, in application-defined order.
	 * @returns A serializable capture, or undefined if edits or branch creation are pending,
	 * a transaction is open, or the view is not an attached shared branch.
	 * @throws A usage error for invalid locations, nodes outside this view's document, or a disposed view.
	 * @remarks
	 * Recompute the selection when publication must wait; do not reuse indices from an earlier state.
	 */
	capture(locations: readonly TreeLocation[]): CapturedTreeLocations | undefined;

	/**
	 * Resolves a captured batch into this view's current local state.
	 * @param capture - The sender's capture, including its revision and opaque node references.
	 * @returns Results in capture order or an explicit unavailable-revision result.
	 * @throws A usage error during a transaction or after disposal.
	 * @remarks
	 * Wait for editor-model updates before using the result in an editor.
	 * Wire encodings are checked, but captures are not authenticated proofs of historical node existence.
	 */
	resolve(capture: CapturedTreeLocations): TreeLocationResolution;
}

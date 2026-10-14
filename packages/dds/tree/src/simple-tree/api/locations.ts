/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";

import type { TreeNode } from "../core/index.js";
import type { TreeArrayNode } from "../node-kinds/index.js";

/**
 * Input describing a whole node, or a gap between elements of an array, in the current local view.
 * @remarks
 * A node location can refer to any SimpleTree {@link TreeNode}, including an entire array.
 * Primitive leaf values do not identify a particular occurrence and are not node locations.
 * Sequence indices count array elements, not UTF-16 units or grapheme clusters unless the schema uses those units.
 * @input @alpha
 */
export type TreeLocation =
	| {
			/**
			 * Selects a node.
			 */
			readonly kind: "node";
			/**
			 * The node being referred to.
			 */
			readonly node: TreeNode;
	  }
	| {
			/**
			 * Selects a gap (insertion point) within a sequence.
			 */
			readonly kind: "sequence";
			/**
			 * The array node whose elements define the sequence.
			 */
			readonly node: TreeArrayNode;
			/**
			 * A gap index from zero through the array length, inclusive.
			 *
			 * Gaps are the positions at which content can be inserted.
			 * Sequences of length N have N+1 valid gap indices, ranging from 0 to N inclusive.
			 * Deletions collapse sequence gaps within the removed span to the deletion boundary.
			 *
			 * @example
			 * In the sequence ["a", "b", "c"], index 0 refers to the gap before "a", index 1
			 * refers to the gap between "a" and "b", and so on.
			 */
			readonly index: number;
			/**
			 * The side of content inserted at the gap on which the position stays.
			 * Defaults to "before" when omitted or undefined.
			 * At move boundaries (when the start or end of a moved range coincides with a gap),
			 * "before" follows the preceding element and "after" follows the following element.
			 * Array boundaries ("before" index 0 and "after" index N) have no adjacent element.
			 * @example
			 * Suppose a local view has the sequence ["a", "b", "c"] and specifies a `TreeLocation` with `index` 1 and `affinity` "before".
			 * If that location is resolved in a view which had inserted "x" at index 1 (such that the sequence becomes ["a", "x", "b", "c"]),
			 * it would now refer to the gap between "a" and "x".
			 *
			 * If the captured location instead used the "after" affinity in the same scenario, its resolved location would be between "x" and "b".
			 * @defaultValue "before"
			 */
			readonly affinity?: "before" | "after" | undefined;

			/**
			 * Dictates how the location should behave when ranges of content surrounding the location are moved.
			 *
			 * "follow" indicates that the location should move along with the surrounding content when it is relocated.
			 * Defaults to "follow" when omitted.
			 * At a moved range's boundaries, affinity determines which adjacent element the location follows.
			 * We do not currently support any other policy.
			 *
			 * A possible future policy could keep the location in the original sequence rather than follow moved content.
			 * @defaultValue "follow"
			 */
			readonly movePolicy?: "follow";
	  };

/**
 * Opaque, JSON-serializable data produced by {@link TreeLocationResolver.capture}.
 * @remarks
 * Designed to be safely transmitted between clients of the same SharedTree in presence messages,
 * including through a JSON serialization round trip, and passed to {@link TreeLocationResolver.resolve}.
 * Applications should treat captures as opaque and not attempt to interpret their contents.
 * @sealed @alpha
 */
export interface CapturedTreeLocations
	extends ErasedType<"@fluidframework/tree.CapturedTreeLocations"> {}

/**
 * The current local location or an explicit unavailable result.
 *
 * See documentation on {@link TreeLocation} for details on location field semantics.
 * @remarks
 * Node locations follow node identity through moves; deletion does not select a replacement.
 * Deletion is terminal for a captured node location, even if a later undo restores the node.
 * Sequence locations follow moved content, including into another array.
 * @sealed @alpha
 */
export type ResolvedTreeLocation =
	| {
			readonly status: "resolved";
			readonly location:
				| {
						readonly kind: "node";
						readonly node: TreeNode;
				  }
				| {
						readonly kind: "sequence";
						readonly node: TreeArrayNode;
						readonly index: number;
						/**
						 * The captured affinity, including the default "before" if none was supplied.
						 */
						readonly affinity: "before" | "after";
				  };
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
 * @sealed @alpha
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
 * Capture currently supports only the main view of an attached SharedTree with no pending local edits.
 * Local forks and non-main shared branches are unsupported.
 *
 * Resolution includes pending local edits and replays the intervening retained history using a sparse representation
 * to update the captured locations into the view that calls `resolve`.
 * Replay cost is linear in the intervening changes and depends on the number of locations.
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
	 * Captures are ephemeral and may be unresolvable as retained history is trimmed; they are not persistent anchors.
	 */
	capture(locations: readonly TreeLocation[]): CapturedTreeLocations;

	/**
	 * Resolves a captured batch into this view's current local state.
	 * @param capture - The opaque presence data produced by the sender's capture.
	 * @returns Results in capture order or an explicit unavailable-revision result.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} on a view other than the main view of an attached SharedTree,
	 * during a transaction, after disposal, or if the receiving view cannot view the current stored schema.
	 * @remarks
	 * Unlike capture, resolution supports pending local edits on the main view.
	 * Not-yet-received, expired, or wrong-context revisions return `revision-unavailable`; these are not usage errors.
	 */
	resolve(capture: CapturedTreeLocations): TreeLocationResolution;
}

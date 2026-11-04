/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";

import type { PlainText } from "../../text/index.js";
import type { TreeNode } from "../core/index.js";
import type { TreeArrayNode } from "../node-kinds/index.js";

/**
 * A public text node supported by text locations.
 * @remarks
 * Supports {@link PlainText.(Tree:variable)} and schemas produced by {@link FormattedText.createSchema}, including subclasses.
 * Implementing the same public methods on an unrelated schema does not make it a supported text node.
 * @sealed @alpha
 */
export type TextLocationNode = TreeNode & PlainText.Members;

/**
 * Input describing a whole node, an array gap, or a text gap in the current local view.
 * @remarks
 * A node location can refer to any SimpleTree {@link TreeNode}, including an entire array.
 * Primitive leaf values do not identify a particular occurrence and are not node locations.
 * Sequence indices count array elements or independently editable text atoms,
 * not UTF-16 units or grapheme clusters unless the schema uses those units.
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
	| (TreeGapCaptureOptions & {
			/**
			 * Selects a gap (insertion point) within a sequence.
			 */
			readonly kind: "sequence";
			/**
			 * The array or public text node whose elements define the sequence.
			 * Use "node" instead to select the entire node.
			 */
			readonly node: TreeArrayNode | TextLocationNode;
			/**
			 * A gap index from zero through the array length or text's `characterCount()`, inclusive.
			 * Text gaps use the same coordinates as the text editing APIs.
			 * Plain text normally counts Unicode code points; formatted text counts atoms, including embedded objects.
			 * There is no implicit UTF-16 or grapheme conversion, and no position inside an atom.
			 *
			 * Gaps are the positions at which content can be inserted.
			 * Sequences of length N have N+1 valid gap indices, ranging from 0 to N inclusive.
			 * Deletions collapse sequence gaps within the removed span to the deletion boundary.
			 * Subsequent edits transform the collapsed gap; undo does not restore its former offset inside deleted content.
			 *
			 * @example
			 * In the sequence ["a", "b", "c"], index 0 refers to the gap before "a", index 1
			 * refers to the gap between "a" and "b", and so on.
			 */
			readonly index: number;
	  });

/**
 * Options for capturing a gap between array elements or text atoms.
 * @input @alpha
 */
export interface TreeGapCaptureOptions {
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
	readonly movePolicy?: "follow" | undefined;
}

/**
 * Opaque, JSON-serializable data for one location produced by {@link TreeLocationResolver.(capture:1)}.
 * @remarks
 * Designed to be safely transmitted between clients of the same SharedTree in presence messages,
 * including through a JSON serialization round trip, and passed to {@link TreeLocationResolver.(resolve:1)}.
 * Applications should treat captures as opaque and not attempt to interpret their contents.
 * Captures do not force retention of history, do not require disposal, and must not be used as long-term persisted references.
 * @sealed @alpha
 */
export interface CapturedTreeLocation
	extends ErasedType<"@fluidframework/tree.CapturedTreeLocation"> {}

/**
 * A successfully resolved location in the current local view.
 *
 * See documentation on {@link TreeLocation} for details on location field semantics.
 * @remarks
 * Node locations follow node identity through moves; deletion does not select a replacement.
 * Deletion is terminal for a captured node location, even if a later undo restores the node.
 * Sequence locations follow moved content, including into another array.
 * Captures of text gaps return a "text" location with the destination's public text node, including when the original text node was deleted.
 * If moved text ends up in an array without a supported text owner, resolution returns a sequence location.
 * Captures of array gaps always return "sequence" locations, even when the array belongs to a text node.
 * Results contain the receiving view's local objects; use {@link TreeNodeApi.is} to narrow them to an application schema.
 * @sealed @alpha
 */
export interface ResolvedTreeLocation {
	/**
	 * Indicates that the captured location resolved successfully.
	 */
	readonly status: "resolved";
	/**
	 * The location in the receiving view, after applying intervening edits.
	 */
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
		  }
		| {
				readonly kind: "text";
				readonly node: TextLocationNode;
				readonly index: number;
				/**
				 * The captured affinity, including the default "before" if none was supplied.
				 */
				readonly affinity: "before" | "after";
		  };
}

/**
 * The current local location, an unavailable target, or an unavailable source revision.
 * @remarks
 * An unavailable revision can be not yet received, expired, or from a different branch.
 * Retry after applying pending inbound operations, or request a fresh capture if the revision has expired.
 * @sealed @alpha
 */
export type TreeLocationResolution =
	| ResolvedTreeLocation
	| {
			readonly status: "unavailable";
			readonly reason: "target-deleted" | "invalid-location";
	  }
	| {
			readonly status: "revision-unavailable";
	  };

/**
 * Captures and resolves ephemeral node selections, sequence positions, and text positions.
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
	 * Captures a location and its revision from the current sequenced state.
	 * @param location - A local node selection, sequence gap, or text gap.
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
	 * - Calls from change-event callbacks are not supported, including callbacks raised after a batch has been applied.
	 * - Node locations require SimpleTree nodes; primitive leaf values cannot identify a particular occurrence.
	 * Sequence locations require array nodes or supported text nodes and count array elements
	 * or independently editable text characters or atoms, not arbitrary text offsets.
	 *
	 * Unsupported view states throw rather than returning undefined.
	 * Captures are ephemeral and may be unresolvable as retained history is trimmed; they are not persistent anchors.
	 */
	capture(location: TreeLocation): CapturedTreeLocation;

	/**
	 * Captures multiple locations from the current sequenced state.
	 * @param locations - Local node selections, sequence gaps, or text gaps.
	 * @returns Independently usable serializable captures in input order. An empty input returns an empty array.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} under the same conditions as the single-location overload,
	 * including when any input location is invalid.
	 * @remarks
	 * Each location has identical semantics, defaults, and preconditions to the single-location overload of {@link TreeLocationResolver.(capture:1)}.
	 * The array overload is more performant when capturing many locations.
	 */
	capture(locations: readonly TreeLocation[]): CapturedTreeLocation[];

	/**
	 * Captures a whole node.
	 * @param node - The node being referred to.
	 * @returns A serializable capture.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} under the same conditions as {@link TreeLocationResolver.(capture:1)}.
	 * @remarks
	 * Equivalent to `capture({ kind: "node", node })`, with the same semantics and preconditions.
	 */
	captureNode(node: TreeNode): CapturedTreeLocation;

	/**
	 * Captures a gap between array elements or independently editable text atoms.
	 * @param node - The array or supported plain or formatted text node whose elements define the sequence.
	 * @param index - A gap index from zero through the array length or text's `characterCount()`, inclusive.
	 * @param options - Affinity and move policy. Defaults to "before" affinity and "follow" move policy.
	 * @returns A serializable capture.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} under the same conditions as {@link TreeLocationResolver.(capture:1)}.
	 * @remarks
	 * Equivalent to `capture({ kind: "sequence", node, index, ...options })`, with the same semantics and preconditions.
	 * Text indices use the same coordinates as the text editing APIs, without implicit UTF-16 or grapheme conversion.
	 */
	captureGap(
		node: TreeArrayNode | TextLocationNode,
		index: number,
		options?: TreeGapCaptureOptions,
	): CapturedTreeLocation;

	/**
	 * Resolves a captured location into this view's current local state.
	 * @param capture - The opaque presence data produced by the sender's capture.
	 * @returns The local location or an explicit unavailable result.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} on a view other than the main view of an attached SharedTree,
	 * during a transaction or change-event callback, after disposal, or if the receiving view cannot view the current stored schema.
	 * @remarks
	 * Unlike capture, resolution supports pending local edits on the main view.
	 * Calls from change-event callbacks are not supported, including callbacks raised after a batch has been applied.
	 * Not-yet-received, expired, or wrong-context revisions return `revision-unavailable`; these are not usage errors.
	 * Structural validation follows SharedTree's configured JSON validator.
	 * When validation is enabled (i.e. a non-no-op JSON validator is configured), malformed envelopes return `revision-unavailable` and malformed locations return `invalid-location`.
	 */
	resolve(capture: CapturedTreeLocation): TreeLocationResolution;

	/**
	 * Resolves captured locations into this view's current local state.
	 * @param captures - Opaque presence data, which may come from different capture calls and revisions.
	 * @returns Results in input order. An empty input returns an empty array.
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} under the same conditions as the single-capture overload.
	 * @remarks
	 * Each capture has identical resolution semantics to the single-capture overload of {@link TreeLocationResolver.(resolve:1)}.
	 * The array overload is more performant when resolving many locations from the same revision.
	 */
	resolve(captures: readonly CapturedTreeLocation[]): TreeLocationResolution[];
}

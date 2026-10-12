/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeArrayNode } from "../node-kinds/index.js";

/**
 * An opaque, JSON-serializable identifier for a sequenced state of a shared branch.
 * @remarks
 * Obtain this value from {@link TreePositionResolver.getCurrentRevision}.
 * Tokens are for ephemeral messages, not persisted positions.
 * They become unavailable when the corresponding history is trimmed.
 * @alpha
 */
export type TreePositionRevision = string;

/**
 * A position between elements of an array at a historical revision.
 * @remarks
 * Indices count array elements, not UTF-16 code units or grapheme clusters.
 * Text editors must convert their coordinates to array indices before sending them.
 * @alpha
 */
export interface HistoricalSequencePosition {
	/**
	 * The receiving view's instance of the same array that contained the position.
	 * This object is not serialized: applications route messages using their own shared sequence identifiers.
	 */
	readonly sequence: TreeArrayNode;
	/**
	 * The gap index at the source revision, from zero through the historical length, inclusive.
	 */
	readonly index: number;
	/**
	 * The side of content inserted at this gap on which the position stays.
	 * @remarks
	 * At move boundaries, "before" follows the preceding element and "after" follows the following element.
	 * The start and end of an array act as sentinels when there is no adjacent element.
	 */
	readonly affinity: "before" | "after";
}

/**
 * The result of resolving one historical position.
 * @remarks
 * A moved position can resolve into a different array.
 * Deletions collapse positions to the deletion boundary.
 * Unavailable positions are never replaced with an unrelated position or silently clamped.
 * @alpha
 */
export type ResolvedSequencePosition =
	| {
			readonly status: "resolved";
			readonly sequence: TreeArrayNode;
			readonly index: number;
	  }
	| {
			readonly status: "unavailable";
			readonly reason: "sequence-deleted" | "invalid-position" | "unsupported-change";
	  };

/**
 * Results for a batch of historical positions, in input order.
 * @remarks
 * An unavailable revision can be unknown, trimmed, or from a different shared branch.
 * Applications should use their transport's operation-ordering barrier before resolving a signal.
 * @alpha
 */
export type PositionResolution =
	| {
			readonly status: "resolved";
			readonly positions: readonly ResolvedSequencePosition[];
	  }
	| {
			readonly status: "revision-unavailable";
	  };

/**
 * Resolves historical array positions into a view's current local state.
 * @remarks
 * Intended for text editors that receive character-level presence in ephemeral messages.
 * Resolution includes pending local edits and does not create tracking references.
 * Applications remain responsible for tracking positions after resolution.
 *
 * The resolver indexes retained history on first use and maintains that index while the view is active.
 * Queries use logarithmically many composed history blocks and binary searches within affected fields.
 * They do not scan array contents or replay every intervening commit.
 *
 * Positions crossing schema changes are reported as unsupported.
 * Local forks cannot publish revision tokens.
 * @sealed @alpha
 */
export interface TreePositionResolver {
	/**
	 * Returns the current sequenced-state token, or undefined if the view has pending edits,
	 * an open transaction, or is not an attached, acknowledged shared branch.
	 * @remarks
	 * Capture positions and this token synchronously, after any edits that materialize shared content.
	 * Do not pair an earlier position with a newer token.
	 * @returns A token for the current sequenced state, or undefined when it cannot be published.
	 */
	getCurrentRevision(): TreePositionRevision | undefined;

	/**
	 * Resolves positions from one revision into the same current local state.
	 * @param revision - The sequenced state in which the indices were measured.
	 * @param positions - Positions to resolve, including both selection endpoints when applicable.
	 * @returns Results in input order, or an explicit unavailable-revision result.
	 * @throws A usage error if called during a transaction, after disposal, or with an array from another view.
	 */
	resolvePositions(
		revision: TreePositionRevision,
		positions: readonly HistoricalSequencePosition[],
	): PositionResolution;
}

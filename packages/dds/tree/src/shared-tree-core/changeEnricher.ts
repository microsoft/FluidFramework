/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GraphCommit, TaggedChange } from "../core/index.js";

/**
 * Allows change to be enriched by using a {@link ChangeEnricherCheckout}.
 */
export interface ChangeEnricherProvider<TChange> {
	/**
	 * Runs a batch of change enrichments using a single {@link ChangeEnricherCheckout}.
	 * @param firstCommit - The first commit in the batch to be enriched.
	 * @param callback - A callback which is passed a {@link ChangeEnricherCheckout} representing the state before applying `firstCommit`.
	 * The `enricher` is only valid in the scope of this callback.
	 * The `callback` is invoked immediately and exactly once.
	 */
	runEnrichmentBatch(
		firstCommit: GraphCommit<TChange>,
		callback: (enricher: ChangeEnricherCheckout<TChange>) => void,
	): void;
}

/**
 * A checkout that can be used by to enrich changes with refreshers.
 *
 * This is similar to a {@link TreeCheckout} in that it represents the state of the tree at a specific revision.
 * But unlike a `TreeCheckout`...
 * - It is not backed by a branch.
 * - The host application has no knowledge of it, so applying changes to it has no impact on the application.
 * - It need not maintain any state or indexes that do not play a role in enriching changes.
 *
 * See implementations for examples.
 */
export interface ChangeEnricherCheckout<TChange> {
	/**
	 * Updates the set of refreshers on a change.
	 * @param change - the change to enrich. Not mutated.
	 * @returns the enriched change. Possibly the same as the one passed in.
	 */
	enrich(change: TChange): TChange;

	/**
	 * Enqueues change to be applied before {@link enrich | enrichment}.
	 * @param change - the change to apply or a callback that produces the change to apply.
	 * The callback will be called at most once during the lifetime of this `ChangeEnricherCheckout`.
	 */
	enqueueChange(change: TaggedChange<TChange> | (() => TaggedChange<TChange>)): void;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GraphCommit, TaggedChange } from "../core/index.js";

export interface ChangeEnricherProvider<TChange> {
	runEnrichmentBatch(
		/**
		 * The first commit to be enriched.
		 */
		firstCommit: GraphCommit<TChange>,
		/**
		 * A callback which is passed a {@link ChangeEnricherCheckout} representing the before applying `firstCommit`.
		 * @param enricher - The enricher checkout. Only valid during the execution of this callback.
		 */
		callback: (enricher: ChangeEnricherCheckout<TChange>) => void,
	): void;
}

/**
 * A checkout that can be used by {@link SharedTreeCore} or {@link DefaultResubmitMachine} to enrich changes with refreshers.
 *
 * This is similar to a {@link TreeCheckout} in that it represents the state of the tree at a specific revision.
 * But unlike a `TreeCheckout`...
 * - It is not backed by a branch because the `ChangeEnricherProvider` that owns it controls which revision it should represent.
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
	 * Enqueues change to be applied before {@link enrich | enriching} then next change.
	 * @param change - the change to apply or a callback that produces the change to apply.
	 * The callback will be called at most once, either during or after this call.
	 */
	enqueueChange(change: TaggedChange<TChange> | (() => TaggedChange<TChange>)): void;
}

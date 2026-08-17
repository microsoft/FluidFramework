/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GraphCommit, TaggedChange } from "../core/index.js";

/**
 * Allows change to be enriched by using a {@link ChangeEnricherCheckout}.
 */
export interface ChangeEnricher<TChange> {
	/**
	 * Runs a batch of change enrichments.
	 * @param context - The branch head after which the `changes` would apply.
	 * @param changes - The changes to be enriched.
	 * @param forceValidation - Whether to force the application of the enriched changes to a side checkout.
	 * This is useful to reduce the likelihood of an invalid change being generated
	 * (either due to the given `changes` being invalid or because of an error in the enrichment logic).
	 * @returns The enriched changes.
	 */
	enrich(
		context: GraphCommit<TChange>,
		changes: readonly TaggedChange<TChange>[],
		forceValidation: boolean,
	): TChange[];
}

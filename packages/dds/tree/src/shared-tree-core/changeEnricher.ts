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
	 * @param forceValidation - Attempt to validate enriched changes before submission in order to fail (throw) locally rather than risk corrupting persisted data.
	 * See {@link SharedTreeOptions.validateCommitsOnFirstSubmission} and {@link SharedTreeOptions.validateRebasedCommitsBeforeResubmission}.
	 */
	enrich(
		context: GraphCommit<TChange>,
		changes: readonly TaggedChange<TChange>[],
		forceValidation: boolean,
	): TChange[];
}

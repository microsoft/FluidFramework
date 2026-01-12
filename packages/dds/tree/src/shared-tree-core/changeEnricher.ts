/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GraphCommit, RevisionTag } from "../core/index.js";
import { disposeSymbol } from "../util/index.js";

export type ChangeEnricherProvider<TChange> = (
	lastCommitApplied: GraphCommit<TChange>,
) => ChangeEnricherCheckout<TChange>;

/**
 * A checkout that can be used by {@link SharedTreeCore} or {@link DefaultResubmitMachine} to enrich changes with refreshers.
 *
 * This is similar to a {@link TreeCheckout} in that it represents the state of the tree at a specific revision.
 * But unlike a `TreeCheckout`...
 * - It is not backed by a branch because the `CommitEnricher` that owns it controls which revision it should represent.
 * - The host application has no knowledge of it, so applying changes to it has no impact on the application.
 * - It need not maintain any state or indexes that do not play a role in enriching changes.
 *
 * See implementations for examples.
 */
export interface ChangeEnricherCheckout<TChange> {
	/**
	 * Updates the set of refreshers on a change.
	 * @param change - the change to enrich. Not mutated.
	 * @param revision - the revision associated with the change.
	 * @returns the enriched change. Possibly the same as the one passed in.
	 */
	updateChangeEnrichments(change: TChange, revision: RevisionTag): TChange;

	/**
	 * Applies a change to the tip state.
	 * @param change - the change to apply. Not mutated.
	 * @param revision - the revision associated with the change.
	 * Can be undefined when the applied change is a rollback.
	 */
	applyTipChange(change: TChange, revision?: RevisionTag): void;

	/**
	 * Disposes of the enricher.
	 */
	[disposeSymbol](): void;
}

export class NoOpChangeEnricher<TChange> implements ChangeEnricherCheckout<TChange> {
	public applyTipChange(change: TChange, revision?: RevisionTag | undefined): void {}
	public updateChangeEnrichments(change: TChange, revision: RevisionTag): TChange {
		return change;
	}
	public [disposeSymbol](): void {}
}

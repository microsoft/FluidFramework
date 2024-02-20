/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily, GraphCommit, RevisionTag } from "../core/index.js";

/**
 * A checkout whose state can be controlled and used to enrich changes with refreshers.
 */
export interface ChangeEnricherCheckout<TChange> {
	/**
	 * Enriches a change with adequate refreshers.
	 * @param change - the change to enrich.
	 * This change must but be applicable to, but have been applied to, the tip state.
	 * @param revision - the revision associated with the change.
	 * @returns the enriched change. Possibly the same as the one passed in.
	 */

	enrichNewTipChange(change: TChange, revision: RevisionTag): TChange;

	/**
	 * Updates the set of refreshers on a change.
	 * @param change - the change to enrich.
	 * This change must have already been passed to `enrichNewTipChange`.
	 * @param revision - the revision associated with the change.
	 * @returns the enriched change. Possibly the same as the one passed in.
	 */
	updateChangeEnrichments(change: TChange, revision: RevisionTag): TChange;

	/**
	 * Applies a change to the tip state.
	 * @param change - the change to apply.
	 * @param revision - the revision associated with the change.
	 */
	applyTipChange(change: TChange, revision: RevisionTag): void;

	/**
	 * Disposes of the checkout.
	 */
	dispose(): void;
}

export class CommitEnricher<TChange, TChangeFamily extends ChangeFamily<any, TChange>> {
	private checkout: ChangeEnricherCheckout<TChange>;

	public constructor(
		private readonly changeFamily: TChangeFamily,
		private readonly mintRevisionTag: () => RevisionTag,
		private readonly checkoutFactory: () => ChangeEnricherCheckout<TChange>,
	) {
		this.checkout = this.checkoutFactory();
	}

	public enrichCommit(commit: GraphCommit<TChange>, isResubmit: boolean): GraphCommit<TChange> {
		// const rollback = this.changeFamily.rebaser.invert(commit, true);
		// this.checkout.applyTipChange(rollback, this.mintRevisionTag());
		const enriched = this.checkout.enrichNewTipChange(commit.change, commit.revision);
		this.checkout.dispose();
		this.checkout = this.checkoutFactory();
		return { ...commit, change: enriched };
	}

	public commitSequenced(revision: RevisionTag): void {
		// no-op
	}
}

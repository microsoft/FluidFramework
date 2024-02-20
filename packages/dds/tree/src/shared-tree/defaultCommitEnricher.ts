/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ChangeFamily, GraphCommit, RevisionTag } from "../core/index.js";
import { ICommitEnricher } from "../shared-tree-core/index.js";

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
	 * Can be undefined when the applied change is a rollback.
	 */
	applyTipChange(change: TChange, revision?: RevisionTag): void;

	/**
	 * Disposes of the checkout.
	 */
	dispose(): void;
}

export class DefaultCommitEnricher<TChange, TChangeFamily extends ChangeFamily<any, TChange>>
	implements ICommitEnricher<TChange>
{
	private checkout: ChangeEnricherCheckout<TChange>;
	/**
	 * The list of commits (from oldest to most recent) that are have been submitted but not sequenced.
	 */
	private readonly inFlight: GraphCommit<TChange>[] = [];

	/**
	 * Represents the index in the `inFlight` array of the most recent in flight commit that has
	 * undergone rebasing but whose enrichments have not been updated.
	 * Is -1 when *any* of the following is true:
	 * - There are no in-flight commits (i.e., no local commits have been made or they have all been sequenced)
	 * - None of the in-flight commits have been rebased
	 * - In-flight commits that have been rebased have all had their enrichments updated
	 */
	private latestInFlightCommitWithStaleEnrichments: number = -1;

	public constructor(
		private readonly changeFamily: TChangeFamily,
		private readonly checkoutFactory: () => ChangeEnricherCheckout<TChange>,
	) {
		this.checkout = this.checkoutFactory();
	}

	public enrichCommit(commit: GraphCommit<TChange>, isResubmit: boolean): GraphCommit<TChange> {
		if (isResubmit) {
			const firstRefresheeIndex = this.inFlight.findIndex(
				(c) => c.revision === commit.revision,
			);
			assert(firstRefresheeIndex !== -1, "Expected resubmitted commit to be in flight");
			const firstRefreshee = this.inFlight[firstRefresheeIndex];

			// None of the commits on the in-flight commits have stale enrichments
			if (this.latestInFlightCommitWithStaleEnrichments === -1) {
				return firstRefreshee;
			}

			// In the resubmit case, we update the refreshers on all stale in-flight commits.
			// This means that when there are commits with stale enrichments in a resubmit case,
			// we should always be asked to update the refreshers on the oldest in-flight commit.
			assert(firstRefresheeIndex === 0, "Unexpected ordering of enrichment calls");

			const fork = this.checkoutFactory();
			for (let iCommit = this.inFlight.length - 1; iCommit >= 0; iCommit -= 1) {
				const priorCommit = this.inFlight[iCommit];
				fork.applyTipChange(this.changeFamily.rebaser.invert(priorCommit, true));
				if (iCommit <= this.latestInFlightCommitWithStaleEnrichments) {
					const refreshed = fork.enrichNewTipChange(
						priorCommit.change,
						priorCommit.revision,
					);
					this.inFlight[iCommit] = { ...priorCommit, change: refreshed };
				}
			}
			fork.dispose();

			// All rebased in-flight commits have now been refreshed
			this.latestInFlightCommitWithStaleEnrichments = -1;
			return this.inFlight[0];
		} else {
			const enriched = this.checkout.enrichNewTipChange(commit.change, commit.revision);
			this.checkout.dispose();
			this.checkout = this.checkoutFactory();
			const enrichedCommit = { ...commit, change: enriched };
			this.inFlight.push(enrichedCommit);
			return enrichedCommit;
		}
	}

	public commitSequenced(isLocal: boolean): void {
		if (isLocal) {
			// The oldest in-flight commit has been sequenced
			this.inFlight.shift();
			this.latestInFlightCommitWithStaleEnrichments -= 1;
		} else {
			// A peer commit has been sequenced
			this.latestInFlightCommitWithStaleEnrichments = this.inFlight.length - 1;
		}
	}
}

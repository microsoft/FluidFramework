/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { ChangeRebaser, GraphCommit, RevisionTag } from "../core/index.js";
import { ICommitEnricher } from "../shared-tree-core/index.js";
import { disposeSymbol } from "../util/index.js";

/**
 * A checkout whose state can be controlled by a {@link CommitEnricher} to enrich changes with refreshers.
 *
 * This is similar to a {@link TreeCheckout} in that it represents the state of the tree at a specific revision.
 * But unlike a `TreeCheckout`...
 * - It is not backed by a branch because the `CommitEnricher` that owns it controls which revision it should represent.
 * - The host application has no knowledge of it, so applying changes to it has not impact on the application.
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

/**
 * Default implementation of {@link ICommitEnricher}.
 */
export class DefaultCommitEnricher<TChange> implements ICommitEnricher<TChange> {
	/**
	 * Change enricher that represent the tip of the top-level local branch (i.e., the branch on which in-flight
	 * commits are applied and automatically rebased).
	 */
	private tip: ChangeEnricherCheckout<TChange>;

	/**
	 * The list of commits (from oldest to most recent) that have been submitted but not sequenced.
	 */
	private inFlightQueue: GraphCommit<TChange>[] = [];

	/**
	 * The list of commits (from oldest to most recent) that should be resubmitted.
	 */
	private resubmitQueue: GraphCommit<TChange>[] = [];

	/**
	 * Represents the index in the `inFlightQueue` array of the most recent in flight commit that has
	 * undergone rebasing but whose enrichments have not been updated.
	 * All in-flight commits with an index inferior or equal to this number have stale enrichments.
	 *
	 * Is -1 when *any* of the following is true:
	 * - There are no in-flight commits (i.e., no local commits have been made or they have all been sequenced)
	 * - None of the in-flight commits have been rebased
	 * - In-flight commits that have been rebased have all had their enrichments updated
	 */
	private latestInFlightCommitWithStaleEnrichments: number = -1;

	public constructor(
		/**
		 * A function that can invert a change.
		 */
		private readonly inverter: ChangeRebaser<TChange>["invert"],
		/**
		 * A factory that return a new {@link ChangeEnricherCheckout} that corresponds to the tip of the top-most local
		 * branch.
		 */
		private readonly checkoutFactory: () => ChangeEnricherCheckout<TChange>,
	) {
		this.tip = this.checkoutFactory();
	}

	public enrichCommit(commit: GraphCommit<TChange>): GraphCommit<TChange> {
		const toResubmit = this.resubmitQueue.shift();
		if (toResubmit !== undefined) {
			this.inFlightQueue.push(toResubmit);
			return toResubmit;
		} else {
			const updatedChange = this.tip.updateChangeEnrichments(commit.change, commit.revision);
			const updatedCommit = { ...commit, change: updatedChange };
			this.inFlightQueue.push(updatedCommit);
			this.tip[disposeSymbol]();
			this.tip = this.checkoutFactory();
			return updatedCommit;
		}
	}

	public prepareForResubmit(toResubmit: readonly GraphCommit<TChange>[]): void {
		assert(
			!this.isInResubmitPhase,
			"Invalid resubmit phase start during incomplete resubmit phase",
		);
		assert(
			toResubmit.length === this.inFlightQueue.length,
			"Unexpected resubmit of more or fewer commits than are in flight",
		);
		if (this.latestInFlightCommitWithStaleEnrichments === -1) {
			// No in-flight commits have stale enrichments, so we can resubmit them as is
			this.resubmitQueue = this.inFlightQueue;
			this.inFlightQueue = [];
		} else {
			const checkout = this.checkoutFactory();
			// Roll back the checkout to the state before the oldest commit
			for (let iCommit = toResubmit.length - 1; iCommit >= 0; iCommit -= 1) {
				const commit = toResubmit[iCommit];
				const rollback = this.inverter(commit, true);
				// WARNING: it's not currently possible to roll back past a schema change (see AB#7265).
				// Either we have to make it possible to do so, or this logic will have to change to work
				// forwards from an earlier fork instead of backwards.
				checkout.applyTipChange(rollback);
			}
			// Update the enrichments of the stale commits
			for (
				let iCommit = 0;
				iCommit <= this.latestInFlightCommitWithStaleEnrichments;
				iCommit += 1
			) {
				const commit = toResubmit[iCommit];
				const enrichedChange = checkout.updateChangeEnrichments(
					commit.change,
					commit.revision,
				);
				const enrichedCommit = { ...commit, change: enrichedChange };
				this.resubmitQueue.push(enrichedCommit);
				if (iCommit < this.latestInFlightCommitWithStaleEnrichments) {
					checkout.applyTipChange(enrichedChange, commit.revision);
				}
				this.inFlightQueue.shift();
			}
			// Whatever commits are left do not have stale enrichments
			for (const commit of this.inFlightQueue) {
				this.resubmitQueue.push(commit);
			}
			this.inFlightQueue.length = 0;
		}
		this.latestInFlightCommitWithStaleEnrichments = -1;
	}

	public get isInResubmitPhase(): boolean {
		return this.resubmitQueue.length !== 0;
	}

	public onSequencedCommitApplied(isLocal: boolean): void {
		if (isLocal) {
			// The oldest in-flight commit has been sequenced
			assert(this.inFlightQueue.length > 0, "Sequencing of unknown local commit");
			this.inFlightQueue.shift();
			if (this.latestInFlightCommitWithStaleEnrichments >= 0) {
				this.latestInFlightCommitWithStaleEnrichments -= 1;
			}
		} else {
			// A peer commit has been sequenced
			this.latestInFlightCommitWithStaleEnrichments = this.inFlightQueue.length - 1;
			this.tip[disposeSymbol]();
			this.tip = this.checkoutFactory();
		}
	}
}

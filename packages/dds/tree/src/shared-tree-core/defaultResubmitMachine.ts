/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type { GraphCommit, TaggedChange } from "../core/index.js";
import { disposeSymbol, hasSome } from "../util/index.js";
import type { ChangeEnricherReadonlyCheckout, ResubmitMachine } from "./index.js";

/**
 * Default implementation of {@link ResubmitMachine}.
 */
export class DefaultResubmitMachine<TChange> implements ResubmitMachine<TChange> {
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
		 * A function that can create a rollback for a given change.
		 */
		private readonly makeRollback: (change: TaggedChange<TChange>) => TChange,
		/**
		 * Change enricher that represent the tip of the top-level local branch (i.e., the branch on which in-flight
		 * commits are applied and automatically rebased).
		 */
		private readonly tip: ChangeEnricherReadonlyCheckout<TChange>,
	) {}

	public onCommitSubmitted(commit: GraphCommit<TChange>): void {
		if (this.isInResubmitPhase) {
			const toResubmit = this.resubmitQueue.shift();
			assert(
				toResubmit === commit,
				0x981 /* Unexpected commit submitted during resubmit phase */,
			);
		}
		this.inFlightQueue.push(commit);
	}

	public prepareForResubmit(toResubmit: readonly GraphCommit<TChange>[]): void {
		assert(
			!this.isInResubmitPhase,
			0x957 /* Invalid resubmit phase start during incomplete resubmit phase */,
		);
		assert(
			toResubmit.length === this.inFlightQueue.length,
			0x958 /* Unexpected resubmit of more or fewer commits than are in flight */,
		);
		if (this.latestInFlightCommitWithStaleEnrichments === -1) {
			// No in-flight commits have stale enrichments, so we can resubmit them as is
			this.resubmitQueue = this.inFlightQueue;
			this.inFlightQueue = [];
		} else {
			const checkout = this.tip.fork();
			// Roll back the checkout to the state before the oldest commit
			for (let iCommit = toResubmit.length - 1; iCommit >= 0; iCommit -= 1) {
				const commit = toResubmit[iCommit] ?? oob();
				const rollback = this.makeRollback(commit);
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
				const commit = toResubmit[iCommit] ?? oob();
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
			checkout[disposeSymbol]();
			// Whatever commits are left do not have stale enrichments
			for (const commit of this.inFlightQueue) {
				this.resubmitQueue.push(commit);
			}
			this.inFlightQueue.length = 0;
		}
		this.latestInFlightCommitWithStaleEnrichments = -1;
	}

	public peekNextCommit(): GraphCommit<TChange> {
		assert(
			this.isInResubmitPhase,
			0x982 /* No available commit to resubmit outside of resubmit phase */,
		);
		assert(hasSome(this.resubmitQueue), 0xa87 /* Expected resubmit queue to be non-empty */);
		return this.resubmitQueue[0];
	}

	public get isInResubmitPhase(): boolean {
		return this.resubmitQueue.length !== 0;
	}

	public onSequencedCommitApplied(isLocal: boolean): void {
		if (isLocal) {
			// The oldest in-flight commit has been sequenced
			assert(this.inFlightQueue.length > 0, 0x959 /* Sequencing of unknown local commit */);
			this.inFlightQueue.shift();
			if (this.latestInFlightCommitWithStaleEnrichments >= 0) {
				this.latestInFlightCommitWithStaleEnrichments -= 1;
			}
		} else {
			// A peer commit has been sequenced
			this.latestInFlightCommitWithStaleEnrichments = this.inFlightQueue.length - 1;
		}
	}
}

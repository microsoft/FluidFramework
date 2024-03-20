/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ChangeFamily, ChangeRebaser, GraphCommit, RevisionTag } from "../core/index.js";
import { ICommitEnricher } from "../shared-tree-core/index.js";
import { disposeSymbol } from "../util/index.js";

/**
 * A checkout whose state can be controlled and used to enrich changes with refreshers.
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

export class DefaultCommitEnricher<TChange> implements ICommitEnricher<TChange> {
	private tip: ChangeEnricherCheckout<TChange>;
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

	/**
	 * When defined, the session is going through a resubmit phase.
	 * Used to manage the enrichment of resubmitted commits.
	 */
	private resubmitPhase?: ResubmitPhaseStateMachine<TChange>;

	public constructor(
		private readonly inverter: ChangeRebaser<TChange>["invert"],
		private readonly checkoutFactory: () => ChangeEnricherCheckout<TChange>,
	) {
		this.tip = this.checkoutFactory();
	}

	public enrichCommit(commit: GraphCommit<TChange>, isResubmit: boolean): GraphCommit<TChange> {
		if (isResubmit) {
			assert(this.resubmitPhase !== undefined, "Invalid resubmit outside of resubmit phase");
			const updatedCommit = this.resubmitPhase.updateCommit(commit);
			if (this.resubmitPhase.isComplete) {
				this.resubmitPhase[disposeSymbol]();
				delete this.resubmitPhase;
			}
			return updatedCommit;
		} else {
			assert(
				this.resubmitPhase === undefined,
				"Invalid enrichment call during incomplete resubmit phase",
			);
			const updatedChange = this.tip.updateChangeEnrichments(commit.change, commit.revision);
			const updatedCommit = { ...commit, change: updatedChange };
			this.inFlight.push(updatedCommit);
			this.tip[disposeSymbol]();
			this.tip = this.checkoutFactory();
			return updatedCommit;
		}
	}

	public startResubmitPhase(rebased: Iterable<GraphCommit<TChange>>): void {
		assert(
			!this.isInResubmitPhase,
			"Invalid resubmit phase start during incomplete resubmit phase",
		);
		this.resubmitPhase = new ResubmitPhaseStateMachine(
			this.inverter,
			this.checkoutFactory(),
			rebased,
		);
	}

	public get isInResubmitPhase(): boolean {
		return this.resubmitPhase !== undefined;
	}

	public commitSequenced(isLocal: boolean): void {
		if (isLocal) {
			// The oldest in-flight commit has been sequenced
			assert(this.inFlight.length > 0, "Sequencing of unknown local commit");
			this.inFlight.shift();
			if (this.latestInFlightCommitWithStaleEnrichments >= 0) {
				this.latestInFlightCommitWithStaleEnrichments -= 1;
			}
		} else {
			// A peer commit has been sequenced
			this.latestInFlightCommitWithStaleEnrichments = this.inFlight.length - 1;
			this.tip[disposeSymbol]();
			this.tip = this.checkoutFactory();
		}
	}
}

/**
 * A helper class that keeps track of the progression of a resubmit phase.
 */
class ResubmitPhaseStateMachine<TChange> {
	/**
	 * The list of commits (from newest to oldest) that need to be resubmitted.
	 */
	private readonly stack: GraphCommit<TChange>[];

	/**
	 * The state before the next commit to be updated.
	 */
	private readonly checkout: ChangeEnricherCheckout<TChange>;

	/**
	 * @param inverter - a function that can generate inverses of `TChange` instances.
	 * @param checkout - a checkout in the local tip state. Owned (and mutated) by this state machine.
	 * @param toResubmit - the commits that are being resubmitted (oldest to newest).
	 * This must be the most rebased version of these commits (i.e., rebased over all known concurrent edits)
	 * as opposed to the version which was last submitted.
	 */
	public constructor(
		inverter: ChangeRebaser<TChange>["invert"],
		checkout: ChangeEnricherCheckout<TChange>,
		toResubmit: Iterable<GraphCommit<TChange>>,
	) {
		this.stack = Array.from(toResubmit).reverse();
		for (const commit of this.stack) {
			// WARNING: it's not currently possible to roll back past a schema change (see AB#7265).
			// Either we have to make it possible to do so, or this logic will have to change to work
			// forwards from an earlier fork instead of backwards.
			const rollback = inverter(commit, true);
			checkout.applyTipChange(rollback);
		}
		this.checkout = checkout;
	}

	public get isComplete(): boolean {
		return this.stack.length === 0;
	}

	public updateCommit(commit: GraphCommit<TChange>): GraphCommit<TChange> {
		const oldCommit = this.stack.pop();
		assert(
			oldCommit !== undefined,
			"Invalid call to updateCommit after resubmit phase completion",
		);
		assert(
			commit === oldCommit,
			"Mismatch between resubmitted commit and commit passed when starting the resubmit phase",
		);
		const enriched = this.checkout.updateChangeEnrichments(commit.change, commit.revision);
		this.checkout.applyTipChange(enriched, commit.revision);
		return { ...commit, change: enriched };
	}

	public [disposeSymbol](): void {
		this.checkout[disposeSymbol]();
	}
}

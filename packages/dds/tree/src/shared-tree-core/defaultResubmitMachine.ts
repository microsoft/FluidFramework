/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";

import type { GraphCommit, RevisionTag, TaggedChange } from "../core/index.js";
import { disposeSymbol } from "../util/index.js";

import type { ChangeEnricherReadonlyCheckout } from "./changeEnricher.js";
import type { ResubmitMachine } from "./resubmitMachine.js";

interface PendingChange<TChange> {
	commit: GraphCommit<TChange>;
	lastEnrichment: number;
}

/**
 * Default implementation of {@link ResubmitMachine}.
 */
export class DefaultResubmitMachine<TChange> implements ResubmitMachine<TChange> {
	/**
	 * Maps from revision of submitted commit to the pending change for that commit.
	 */
	private readonly pendingChanges: Map<RevisionTag, PendingChange<TChange>> = new Map();

	/**
	 * The current enrichment version for in-flight commits.
	 * Incremented when a peer commit is sequenced.
	 */
	private currentEnrichment: number = 0;

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
		this.pendingChanges.set(commit.revision, {
			commit,
			lastEnrichment: this.currentEnrichment,
		});
	}

	public onCommitRollback(commit: GraphCommit<TChange>): void {
		this.pendingChanges.delete(commit.revision);
	}

	private updateEnrichments(
		revision: RevisionTag,
		getLocalCommits: () => readonly GraphCommit<TChange>[],
	): void {
		const pendingChange = this.pendingChanges.get(revision);
		if (
			pendingChange === undefined ||
			pendingChange.lastEnrichment === this.currentEnrichment
		) {
			// The first commit to resubmit has a valid enrichment, so all pending commits must be valid.
			return;
		}

		const localCommits = getLocalCommits();
		assert(
			localCommits[0]?.revision === revision,
			0xc79 /* Expected local commits to start with specified revision */,
		);

		// Some in-flight commits have stale enrichments, so we recompute them.
		const checkout = this.tip.fork();

		// Roll back the checkout to the state before the oldest commit
		for (let iCommit = localCommits.length - 1; iCommit >= 0; iCommit -= 1) {
			const commit = localCommits[iCommit] ?? oob();
			const rollback = this.makeRollback(commit);
			// WARNING: it's not currently possible to roll back past a schema change (see AB#7265).
			// Either we have to make it possible to do so, or this logic will have to change to work
			// forwards from an earlier fork instead of backwards.
			checkout.applyTipChange(rollback);
		}

		// Update the enrichments of the stale commits.
		for (const [iCommit, commit] of localCommits.entries()) {
			const current = this.getPendingChange(commit.revision);
			assert(
				current !== undefined,
				0xbda /* there must be an inflight commit for each resubmit commit */,
			);

			if (current.lastEnrichment < this.currentEnrichment) {
				const enrichedChange = checkout.updateChangeEnrichments(
					commit.change,
					commit.revision,
				);
				const enrichedCommit = { ...commit, change: enrichedChange };

				// Optimization: only apply the enriched change if the next commit also needs enrichment.
				const nextCommit = localCommits[iCommit + 1];
				if (
					nextCommit !== undefined &&
					this.getPendingChange(nextCommit.revision).lastEnrichment < this.currentEnrichment
				) {
					checkout.applyTipChange(enrichedChange, commit.revision);
				}

				current.commit = enrichedCommit;
				current.lastEnrichment = this.currentEnrichment;
			}
		}
		checkout[disposeSymbol]();
	}

	public getEnrichedCommit(
		revision: RevisionTag,
		getLocalCommitsSince: () => readonly GraphCommit<TChange>[],
	): GraphCommit<TChange> | undefined {
		this.updateEnrichments(revision, getLocalCommitsSince);
		const pendingChange = this.pendingChanges.get(revision);
		return pendingChange?.commit;
	}

	private getPendingChange(revision: RevisionTag): PendingChange<TChange> {
		return (
			this.pendingChanges.get(revision) ??
			fail(0xc7a /* No pending change stored for this revision */)
		);
	}

	public onSequencedCommitApplied(revision: RevisionTag, isLocal: boolean): void {
		// We no longer need to track enrichment for the commit with this revision.
		// Note that we may have a commit for this revision even if this is not a local change,
		// as this client and another peer may have merged the same commit from a shared branch.
		this.pendingChanges.delete(revision);
		if (!isLocal) {
			// A peer commit has been sequenced, invalidating the enrichment of our in-flight commits.
			this.currentEnrichment++;
		}
	}
}

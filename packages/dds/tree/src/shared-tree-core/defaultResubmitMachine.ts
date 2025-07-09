/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	assert,
	DoublyLinkedList,
	oob,
	type ListNode,
	type ListNodeRange,
} from "@fluidframework/core-utils/internal";

import type { GraphCommit, TaggedChange } from "../core/index.js";
import { disposeSymbol, hasSome } from "../util/index.js";

import type { ChangeEnricherReadonlyCheckout, ResubmitMachine } from "./index.js";

interface PendingChange<TChange> {
	commit: GraphCommit<TChange>;
	lastEnrichment: number;
}
type PendingChangeNode<TChange> = ListNode<PendingChange<TChange>>;

/**
 * Default implementation of {@link ResubmitMachine}.
 */
export class DefaultResubmitMachine<TChange> implements ResubmitMachine<TChange> {
	/**
	 * The list of commits (from oldest to most recent) that have been submitted but not sequenced.
	 */
	private readonly inFlightQueue: DoublyLinkedList<PendingChange<TChange>> =
		new DoublyLinkedList();

	/**
	 * The range of in-flight commits that are currently being resubmitted.
	 * Defined only during the resubmit phase.
	 */
	private pendingResubmitRange: ListNodeRange<PendingChange<TChange>> | undefined;

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
		if (this.pendingResubmitRange !== undefined) {
			const toResubmit = this.pendingResubmitRange?.first;
			assert(
				toResubmit?.data.commit === commit,
				0x981 /* Unexpected commit submitted during resubmit phase */,
			);
			// If we are not at the last commit to resubmit, advance the range to the next node.
			// Otherwise, clear the resubmit range as we are done resubmitting.
			if (toResubmit !== this.pendingResubmitRange.last) {
				assert(toResubmit.next !== undefined, 0xbd6 /* must be more in the list */);
				this.pendingResubmitRange.first = toResubmit.next;
			} else {
				this.pendingResubmitRange = undefined;
			}
			toResubmit.remove();
		}
		this.inFlightQueue.push({ commit, lastEnrichment: this.currentEnrichment });
	}

	public onCommitRollback(commit: GraphCommit<TChange>): void {
		assert(
			commit.revision === this.inFlightQueue.last?.data.commit.revision,
			0xbd7 /* must rollback latest commit in the in flight queue */,
		);
		this.inFlightQueue.pop();
	}

	public prepareForResubmit(toResubmit: readonly GraphCommit<TChange>[]): void {
		assert(
			!this.isInResubmitPhase,
			0x957 /* Invalid resubmit phase start during incomplete resubmit phase */,
		);

		if (!hasSome(toResubmit)) {
			return;
		}

		assert(
			toResubmit.length <= this.inFlightQueue.length,
			0xbd8 /* Unexpected resubmit of more commits than are in flight */,
		);

		// Find the first in-flight commit to resubmit.
		const first = this.inFlightQueue.find(
			(v) => v.data.commit.revision === toResubmit[0].revision,
		);
		// Always resubmit to the end of all outstanding ops, but the list may grow during resubmit,
		// so we must track the current end at the start of the phase.
		const last = this.inFlightQueue.last;
		assert(
			first !== undefined && last !== undefined,
			0xbd9 /* there must be inflight commits to resubmit */,
		);

		this.pendingResubmitRange = { first, last };
		// If any in-flight commits have stale enrichments, recompute them.
		if (first.data.lastEnrichment < this.currentEnrichment) {
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

			// Update the enrichments of the stale commits in the in-flight queue.
			let current: PendingChangeNode<TChange> | undefined = first;
			for (const commit of toResubmit) {
				assert(
					current !== undefined,
					0xbda /* there must be an inflight commit for each resubmit commit */,
				);
				current.data.commit = commit;
				if (current.data.lastEnrichment < this.currentEnrichment) {
					const enrichedChange = checkout.updateChangeEnrichments(
						commit.change,
						commit.revision,
					);
					const enrichedCommit = { ...commit, change: enrichedChange };

					// Optimization: only apply the enriched change if the next commit also needs enrichment.
					if (
						current.next !== undefined &&
						current.next.data.lastEnrichment < this.currentEnrichment
					) {
						checkout.applyTipChange(enrichedChange, commit.revision);
					}

					current.data.commit = enrichedCommit;
					current.data.lastEnrichment = this.currentEnrichment;
				}
				current = current.next;
			}
			checkout[disposeSymbol]();
		}
	}

	public peekNextCommit(): GraphCommit<TChange> {
		assert(
			this.isInResubmitPhase,
			0x982 /* No available commit to resubmit outside of resubmit phase */,
		);
		assert(
			this.pendingResubmitRange !== undefined,
			0xa87 /* Expected resubmit queue to be non-empty */,
		);
		return this.pendingResubmitRange.first.data.commit;
	}

	public get isInResubmitPhase(): boolean {
		return this.pendingResubmitRange !== undefined;
	}

	public onSequencedCommitApplied(isLocal: boolean): void {
		if (isLocal) {
			// The oldest in-flight commit has been sequenced
			assert(this.inFlightQueue.length > 0, 0x959 /* Sequencing of unknown local commit */);
			this.inFlightQueue.shift();
		} else {
			// A peer commit has been sequenced
			this.currentEnrichment++;
		}
	}
}

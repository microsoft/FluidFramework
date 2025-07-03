/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	assert,
	DoublyLinkedList,
	type ListNodeRange,
} from "@fluidframework/core-utils/internal";

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
	private readonly inFlightQueue: DoublyLinkedList<{
		commit: GraphCommit<TChange>;
		refSeq: number;
	}> = new DoublyLinkedList();

	private pendingResubmitRange:
		| ListNodeRange<{ commit: GraphCommit<TChange>; refSeq: number }>
		| undefined;

	private staleEnrichmentsBeforeSeq: number = 0;

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
			if (toResubmit !== this.pendingResubmitRange.last) {
				assert(this.pendingResubmitRange.first.next !== undefined, "must be more in the list");
				this.pendingResubmitRange.first = this.pendingResubmitRange.first.next;
			} else {
				this.pendingResubmitRange = undefined;
			}
			toResubmit.remove();

			assert(
				toResubmit?.data.commit === commit,
				0x981 /* Unexpected commit submitted during resubmit phase */,
			);
		}
		this.inFlightQueue.push({ commit, refSeq: this.staleEnrichmentsBeforeSeq });
	}

	public onCommitRollback(commit: GraphCommit<TChange>): void {
		assert(
			commit.revision === this.inFlightQueue.last?.data.commit.revision,
			"must rollback latest commit in the in flight queue",
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

		const first = this.inFlightQueue.find(
			(v) => v.data.commit.revision === toResubmit[0].revision,
		);
		let current = first;
		for (const commit of toResubmit) {
			assert(current !== undefined, "");
			current.data.commit = commit;
			current = current.next;
		}

		const last = this.inFlightQueue.last;
		assert(
			first !== undefined && last !== undefined,
			"there must be inflight commits to resubmit",
		);

		// No in-flight commits have stale enrichments, so we can resubmit them as is
		this.pendingResubmitRange = { first, last };
		if (first.data.refSeq < this.staleEnrichmentsBeforeSeq) {
			const checkout = this.tip.fork();

			for (
				let iCommit = this.inFlightQueue.last;
				iCommit !== undefined && iCommit !== first.prev;
				iCommit = iCommit?.prev
			) {
				const { commit } = iCommit.data;
				const rollback = this.makeRollback(commit);
				// WARNING: it's not currently possible to roll back past a schema change (see AB#7265).
				// Either we have to make it possible to do so, or this logic will have to change to work
				// forwards from an earlier fork instead of backwards.
				checkout.applyTipChange(rollback);
			}

			// Update the enrichments of the stale commits
			for (
				let iCommit = first;
				iCommit !== undefined && iCommit.data.refSeq < this.staleEnrichmentsBeforeSeq;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				iCommit = iCommit.next!
			) {
				const { commit } = iCommit.data;
				const enrichedChange = checkout.updateChangeEnrichments(
					commit.change,
					commit.revision,
				);
				const enrichedCommit = { ...commit, change: enrichedChange };
				// this is an optimization to avoid applying changes that will
				// never be leveraged. specifically, we only apply if
				// subsequent commits also need enrichment
				if (
					iCommit.next !== undefined &&
					iCommit.next.data.refSeq < this.staleEnrichmentsBeforeSeq
				) {
					checkout.applyTipChange(enrichedChange, commit.revision);
				}
				iCommit.data.commit = enrichedCommit;
				iCommit.data.refSeq = this.staleEnrichmentsBeforeSeq;
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
			this.staleEnrichmentsBeforeSeq++;
		}
	}
}

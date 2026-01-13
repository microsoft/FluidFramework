/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import type { GraphCommit, RevisionTag } from "../core/index.js";
import { hasSome } from "../util/index.js";

import type { ChangeEnricherProvider } from "./changeEnricher.js";
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
		 * Change enricher that represent the tip of the top-level local branch (i.e., the branch on which in-flight
		 * commits are applied and automatically rebased).
		 */
		private readonly provider: ChangeEnricherProvider<TChange>,
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

		const pendingChanges = getLocalCommits().map((newCommit) => {
			const pending = this.getPendingChange(newCommit.revision);
			assert(
				pending !== undefined,
				0xbda /* there must be an inflight commit for each resubmit commit */,
			);
			const isStale = pending.lastEnrichment < this.currentEnrichment;
			return { pending, newCommit, isStale };
		});

		assert(
			hasSome(pendingChanges) && pendingChanges[0].newCommit.revision === revision,
			0xc79 /* Expected local commits to start with specified revision */,
		);

		// Some in-flight commits have stale enrichments, so we recompute them.
		this.provider.runEnrichmentBatch(pendingChanges[0].newCommit, (enricher) => {
			for (const [index, { pending, newCommit, isStale }] of pendingChanges.entries()) {
				if (!isStale) {
					assert(
						!pendingChanges.slice(index + 1).some((pc) => pc.isStale),
						"Unexpected non-stale commit after stale enrichment",
					);
					break;
				}
				const enrichedChange = enricher.enrich(newCommit.change);
				const enrichedCommit = { ...newCommit, change: enrichedChange };

				enricher.enqueueChange(enrichedCommit);

				pending.commit = enrichedCommit;
				pending.lastEnrichment = this.currentEnrichment;
			}
		});
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

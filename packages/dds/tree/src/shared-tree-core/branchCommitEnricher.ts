/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type ChangeRebaser, type GraphCommit, replaceChange } from "../core/index.js";

import type { SharedTreeBranchChange } from "./branch.js";
import type { ChangeEnricherCheckout, ChangeEnricherProvider } from "./changeEnricher.js";
import { getLast, hasSome } from "../util/index.js";

/**
 * Utility for enriching commits from a {@link Branch} before these commits are applied and submitted.
 */
export class BranchCommitEnricher<TChange> {
	private readonly enricher: ChangeEnricherCheckout<TChange>;
	/**
	 * Maps each local commit to the corresponding enriched commit.
	 * @remarks
	 * Entries are added when the commits are {@link BranchCommitEnricher.processChange | processed during a change}.
	 * Each entry is removed when it is {@link BranchCommitEnricher.enrich | retrieved}.
	 * In the event that an entry is not explicitly removed, it will eventually be {@link WeakMap | dropped from memory} along with the associated commit.
	 */
	private readonly preparedCommits: WeakMap<GraphCommit<TChange>, GraphCommit<TChange>> =
		new Map();

	private transactionDepth = 0;

	public constructor(
		rebaser: ChangeRebaser<TChange>,
		private readonly enricherProvider: ChangeEnricherProvider<TChange>,
	) {}

	/**
	 * Process the given change, preparing new commits for {@link BranchCommitEnricher.enrich | enrichment}.
	 * @param change - The change to process.
	 */
	public processChange(
		head: GraphCommit<TChange>,
		change: SharedTreeBranchChange<TChange>,
	): void {
		if (change.type === "append" && hasSome(change.newCommits)) {
			if (change.newCommits.length === 1) {
				const newCommit = change.newCommits[0];
				const newChange = this.enricher.updateChangeEnrichments(
					newCommit.change,
					newCommit.revision,
				);
				this.preparedCommits.set(newCommit, replaceChange(newCommit, newChange));
			} else {
				const enricher = this.enricherProvider(head);
				const lastCommit = getLast(change.newCommits);
				for (const newCommit of change.newCommits) {
					const newChange = enricher.updateChangeEnrichments(
						newCommit.change,
						newCommit.revision,
					);
					this.preparedCommits.set(newCommit, replaceChange(newCommit, newChange));
					if (newCommit !== lastCommit) {
						enricher.applyTipChange(newCommit.change, newCommit.revision);
					}
				}
			}
		}
	}

	/**
	 * Retrieves the enriched version of the given commit.
	 * @param commit - A commit {@link BranchCommitEnricher.processChange | processed during the most recent change}.
	 * @remarks A commit can only be enriched once - subsequent calls to this method with the same commit will throw an error.
	 */
	public enrich(commit: GraphCommit<TChange>): GraphCommit<TChange> {
		const prepared = this.preparedCommits.get(commit);
		assert(prepared !== undefined, 0x980 /* Unknown commit */);
		this.preparedCommits.delete(commit);
		return prepared;
	}

	/**
	 * Notify the enricher that a new transaction has started.
	 * @remarks This may be called multiple times without calling {@link BranchCommitEnricher.commitTransaction | commitTransaction}, producing "nested transactions".
	 */
	public startTransaction(): void {
		this.transactionDepth += 1;
	}

	/**
	 * Commit the current transaction.
	 * @remarks This should be called _before_ the corresponding transaction commit change is {@link BranchCommitEnricher.processChange | processed}.
	 */
	public commitTransaction(): void {
		this.transactionDepth -= 1;
	}

	/**
	 * Notify the enricher that the current transaction has been aborted.
	 * @remarks This will throw an error if there is no ongoing transaction.
	 */
	public abortTransaction(): void {
		this.transactionDepth -= 1;
	}
}

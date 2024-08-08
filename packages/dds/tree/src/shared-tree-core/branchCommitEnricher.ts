/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { type ChangeRebaser, type GraphCommit, replaceChange } from "../core/index.js";
import type { ChangeEnricherReadonlyCheckout } from "./changeEnricher.js";
import { TransactionEnricher } from "./transactionEnricher.js";

/**
 * Utility for enriching commits from a {@link Branch} before these commits are applied and submitted.
 */
export class BranchCommitEnricher<TChange> {
	private readonly transactionEnricher: TransactionEnricher<TChange>;
	private readonly enricher: ChangeEnricherReadonlyCheckout<TChange>;
	/**
	 * Maps each local commit to the corresponding enriched commit.
	 * Entries are added when the commits are prepared (before being applied and submitted).
	 * Entries are removed when the commits are retrieved for submission (after being applied).
	 * It's possible an entry will linger in the map indefinitely if it is never retrieved for submission.
	 * This would happen if applying a commit were to fail and the commit were not retrieved/purged after the failure.
	 */
	private readonly preparedCommits: Map<GraphCommit<TChange>, GraphCommit<TChange>> =
		new Map();

	public constructor(
		rebaser: ChangeRebaser<TChange>,
		enricher: ChangeEnricherReadonlyCheckout<TChange>,
	) {
		this.enricher = enricher;
		this.transactionEnricher = new TransactionEnricher(rebaser, this.enricher);
	}

	/**
	 * @returns The number of commits that have been prepared but not yet retrieved.
	 */
	public get preparedCommitsCount(): number {
		return this.preparedCommits.size;
	}

	public startNewTransaction(): void {
		this.transactionEnricher.startNewTransaction();
	}

	public commitCurrentTransaction(): void {
		this.transactionEnricher.commitCurrentTransaction();
	}

	public abortCurrentTransaction(): void {
		this.transactionEnricher.abortCurrentTransaction();
	}

	/**
	 * Adds a commit to the enricher.
	 * @param commit - A commit that is part of a transaction.
	 */
	public ingestTransactionCommit(commit: GraphCommit<TChange>): void {
		// We do not submit ops for changes that are part of a transaction.
		// But we need to enrich the commits that will be sent if the transaction is committed.
		this.transactionEnricher.addTransactionStep(commit);
	}

	/**
	 * Prepares an enriched commit for later submission (see {@link BranchCommitEnricher.getPreparedCommit}).
	 * @param commit - The commit to prepare an enriched version of.
	 * @param concludesOuterTransaction - Whether the commit concludes an outer transaction.
	 *
	 * Each call to this method must be followed by a call to {@link BranchCommitEnricher.getPreparedCommit} or
	 * {@link BranchCommitEnricher.purgePreparedCommits}. Failing to do so will result in a memory leak.
	 */
	public prepareCommit(
		commit: GraphCommit<TChange>,
		concludesOuterTransaction: boolean,
	): void {
		let enrichedChange: TChange;
		if (concludesOuterTransaction) {
			assert(
				this.transactionEnricher !== undefined,
				0x97f /* Unexpected transaction commit without transaction steps */,
			);
			enrichedChange = this.transactionEnricher.getComposedChange(commit.revision);
		} else {
			enrichedChange = this.enricher.updateChangeEnrichments(commit.change, commit.revision);
		}
		this.preparedCommits.set(commit, replaceChange(commit, enrichedChange));
	}

	/**
	 * @param commit - A commit previously passed to {@link BranchCommitEnricher.prepareCommit}.
	 * @returns The enriched commit corresponds to the given commit.
	 */
	public getPreparedCommit(commit: GraphCommit<TChange>): GraphCommit<TChange> {
		const prepared = this.preparedCommits.get(commit);
		assert(prepared !== undefined, 0x980 /* Unknown commit */);
		this.preparedCommits.delete(commit);
		return prepared;
	}

	/**
	 * Purges all commits that have been prepared but not been retrieved.
	 * This should be called to avoid memory leaks if the prepared commits are no longer needed.
	 *
	 * Does not affect ingested transaction commits.
	 */
	public purgePreparedCommits(): void {
		this.preparedCommits.clear();
	}
}

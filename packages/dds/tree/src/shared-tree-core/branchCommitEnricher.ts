/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { ChangeRebaser, GraphCommit, replaceChange } from "../core/index.js";
import { ChangeEnricherReadonlyCheckout } from "./changeEnricher.js";
import { TransactionEnricher } from "./transactionEnricher.js";

/**
 * Utility for enriching commits from a {@link Branch} before these commits are applied and submitted.
 */
export class BranchCommitEnricher<TChange> {
	private transactionEnricher?: TransactionEnricher<TChange>;
	private readonly rebaser: ChangeRebaser<TChange>;
	private readonly enricher: ChangeEnricherReadonlyCheckout<TChange>;
	private readonly preparedCommits: {
		readonly local: GraphCommit<TChange>;
		readonly toSend: GraphCommit<TChange>;
	}[] = [];

	public constructor(
		rebaser: ChangeRebaser<TChange>,
		enricher: ChangeEnricherReadonlyCheckout<TChange>,
	) {
		this.rebaser = rebaser;
		this.enricher = enricher;
	}

	/**
	 * Adds a commit to the enricher.
	 * @param commit - A commit that is part of a transaction.
	 */
	public ingestTransactionCommit(commit: GraphCommit<TChange>): void {
		// We do not submit ops for changes that are part of a transaction.
		// But we need to enrich the commits that will be sent if the transaction is committed.
		this.transactionEnricher ??= new TransactionEnricher(this.rebaser, this.enricher);
		this.transactionEnricher.addTransactionSteps(commit);
	}

	/**
	 * Prepares an enriched commit for later submission (see {@link BranchCommitEnricher.getPreparedCommit}).
	 * @param commit - The commit to prepare an enriched version of.
	 * @param concludesOuterTransaction - Whether the commit concludes an outer transaction.
	 */
	public prepareCommit(commit: GraphCommit<TChange>, concludesOuterTransaction: boolean): void {
		let enrichedChange: TChange;
		if (concludesOuterTransaction) {
			assert(
				this.transactionEnricher !== undefined,
				"Unexpected transaction commit without transaction steps",
			);
			enrichedChange = this.transactionEnricher.getComposedChange(commit.revision);
			delete this.transactionEnricher;
		} else {
			enrichedChange = this.enricher.updateChangeEnrichments(commit.change, commit.revision);
		}
		this.preparedCommits.push({
			local: commit,
			toSend: replaceChange(commit, enrichedChange),
		});
	}

	/**
	 * @param commit - A commit previously passed to {@link BranchCommitEnricher.prepareCommit}.
	 * @returns The enriched commit corresponds to the given commit.
	 *
	 * Commits are expected to be retrieved in the same order they were prepared (FIFO).
	 */
	public getPreparedCommit(commit: GraphCommit<TChange>): GraphCommit<TChange> {
		const prepared = this.preparedCommits.shift();
		assert(prepared?.local === commit, "Inconsistent commits between before and after change");
		return prepared.toSend;
	}
}

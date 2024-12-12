/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	type ChangeRebaser,
	type GraphCommit,
	replaceChange,
	type RevisionTag,
} from "../core/index.js";
import type { ChangeEnricherReadonlyCheckout } from "./changeEnricher.js";
import { TransactionEnricher } from "./transactionEnricher.js";
import type { SharedTreeBranchChange } from "./branch.js";

/**
 * Utility for enriching commits from a {@link Branch} before these commits are applied and submitted.
 */
export class BranchCommitEnricher<TChange> {
	readonly #transactionEnricher: TransactionEnricher<TChange>;
	readonly #enricher: ChangeEnricherReadonlyCheckout<TChange>;
	/**
	 * Maps each local commit to the corresponding enriched commit.
	 * @remarks
	 * Entries are added when the commits are {@link BranchCommitEnricher.processChange | processed during a change}.
	 * Each entry is removed when it is {@link BranchCommitEnricher.enrich | retrieved}.
	 * In the event that an entry is not explicitly removed, it will eventually be {@link WeakMap | dropped from memory} along with the associated commit.
	 */
	readonly #preparedCommits: WeakMap<GraphCommit<TChange>, GraphCommit<TChange>> = new Map();

	/**
	 * If defined, a top-level transaction has been {@link BranchCommitEnricher.commitTransaction | committed} since the last {@link BranchCommitEnricher.processChange | change has been processed}.
	 * Calling this function will compute the composition of that transaction's commits.
	 * @remarks This function will be reset to undefined after each {@link BranchCommitEnricher.processChange | change is processed}.
	 */
	#getOuterTransactionChange?: (revision: RevisionTag) => TChange;

	public constructor(
		rebaser: ChangeRebaser<TChange>,
		enricher: ChangeEnricherReadonlyCheckout<TChange>,
	) {
		this.#enricher = enricher;
		this.#transactionEnricher = new TransactionEnricher(rebaser, this.#enricher);
	}

	/**
	 * Process the given change, preparing new commits for {@link BranchCommitEnricher.enrich | enrichment}.
	 * @param change - The change to process.
	 * @param isAttached - Whether or not the SharedTree is attached to the service.
	 */
	public processChange(change: SharedTreeBranchChange<TChange>): void {
		if (change.type === "append") {
			for (const newCommit of change.newCommits) {
				const newChange =
					this.#getOuterTransactionChange?.(newCommit.revision) ??
					this.#enricher.updateChangeEnrichments(newCommit.change, newCommit.revision);

				this.#preparedCommits.set(newCommit, replaceChange(newCommit, newChange));
			}
		}

		this.#getOuterTransactionChange = undefined;
	}

	/**
	 * Retrieves the enriched version of the given commit.
	 * @param commit - A commit {@link BranchCommitEnricher.processChange | processed during the most recent change}.
	 * @remarks A commit can only be enriched once - subsequent calls to this method with the same commit will throw an error.
	 */
	public enrich(commit: GraphCommit<TChange>): GraphCommit<TChange> {
		const prepared = this.#preparedCommits.get(commit);
		assert(prepared !== undefined, 0x980 /* Unknown commit */);
		this.#preparedCommits.delete(commit);
		return prepared;
	}

	/**
	 * Notify the enricher that a new transaction has started.
	 * @remarks This may be called multiple times without calling {@link BranchCommitEnricher.commitTransaction | commitTransaction}, producing "nested transactions".
	 */
	public startTransaction(): void {
		this.#transactionEnricher.startTransaction();
	}

	/**
	 * Commit the current transaction.
	 * @remarks This should be called _before_ the corresponding transaction commit change is {@link BranchCommitEnricher.processChange | processed}.
	 */
	public commitTransaction(): void {
		this.#getOuterTransactionChange = this.#transactionEnricher.commitTransaction();
	}

	/**
	 * Notify the enricher that the current transaction has been aborted.
	 * @remarks This will throw an error if there is no ongoing transaction.
	 */
	public abortTransaction(): void {
		this.#transactionEnricher.abortTransaction();
	}

	/**
	 * Add new transaction commits to the current transaction.
	 * @param newCommits - The new commits to add.
	 * @remarks This will throw an error if there is no ongoing transaction.
	 */
	public addTransactionCommits(newCommits: Iterable<GraphCommit<TChange>>): void {
		assert(this.#transactionEnricher.isTransacting(), "Not in transaction");
		for (const commit of newCommits) {
			this.#transactionEnricher.addTransactionStep(commit);
		}
	}
}

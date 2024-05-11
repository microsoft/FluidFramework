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

	public prepareCommit(
		commit: GraphCommit<TChange>,
		isTransactionOngoing: boolean,
		isTransactionCommit: boolean,
	): void {
		if (isTransactionOngoing) {
			if (isTransactionCommit) {
				// This event if fired for the completion of a nested transaction.
				// We do not need to add the commit to the transaction enricher
				// because we have already added the steps that make up this nested transaction.
			} else {
				// We do not submit ops for changes that are part of a transaction.
				// But we need to enrich the commits that will be sent if the transaction is committed.
				if (this.transactionEnricher === undefined) {
					this.transactionEnricher = new TransactionEnricher(this.rebaser, this.enricher);
				}
				this.transactionEnricher.addTransactionSteps(commit);
			}
		} else {
			if (isTransactionCommit) {
				assert(
					this.transactionEnricher !== undefined,
					"Unexpected transaction commit without transaction steps",
				);
				const enrichedChange = this.transactionEnricher.getComposedChange(commit.revision);
				delete this.transactionEnricher;

				this.preparedCommits.push({
					local: commit,
					toSend: replaceChange(commit, enrichedChange),
				});
			} else {
				const enrichedChange = this.enricher.updateChangeEnrichments(
					commit.change,
					commit.revision,
				);
				this.preparedCommits.push({
					local: commit,
					toSend: replaceChange(commit, enrichedChange),
				});
			}
		}
	}

	public getPreparedCommit(commit: GraphCommit<TChange>): GraphCommit<TChange> {
		const prepared = this.preparedCommits.shift();
		assert(prepared?.local === commit, "Inconsistent commits between before and after change");
		return prepared.toSend;
	}
}

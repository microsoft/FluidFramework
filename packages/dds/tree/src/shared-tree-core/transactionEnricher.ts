/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ChangeRebaser, GraphCommit, RevisionTag } from "../core/index.js";
import type { ChangeEnricherReadonlyCheckout } from "./changeEnricher.js";

/**
 * Utility for producing an enriched commit out of multiple transaction steps
 */
export class TransactionEnricher<TChange> {
	private readonly rebaser: ChangeRebaser<TChange>;
	private readonly enricher: ChangeEnricherReadonlyCheckout<TChange>;
	private readonly transactionCommits: GraphCommit<TChange>[] = [];
	/**
	 * The number of commits before the start of each active transaction scope.
	 * For a stack of `n` transaction scopes, the array will contain `n` integers,
	 * where the integer at index `i` is the number of commits made before the start of the `i`th transaction scope
	 * (therefore, the first element in the array, if present, is always 0)
	 */
	private readonly transactionScopesStart: number[] = [];

	public constructor(
		rebaser: ChangeRebaser<TChange>,
		enricher: ChangeEnricherReadonlyCheckout<TChange>,
	) {
		this.rebaser = rebaser;
		this.enricher = enricher;
	}

	public startNewTransaction(): void {
		this.transactionScopesStart.push(this.transactionCommits.length);
	}

	public commitCurrentTransaction(): void {
		const commitsCommitted = this.transactionScopesStart.pop();
		assert(commitsCommitted !== undefined, 0x985 /* No transaction to commit */);
	}

	public abortCurrentTransaction(): void {
		const scopeStart = this.transactionScopesStart.pop();
		assert(scopeStart !== undefined, 0x986 /* No transaction to abort */);
		this.transactionCommits.length = scopeStart;
	}

	public addTransactionStep(commit: GraphCommit<TChange>): void {
		assert(
			this.transactionScopesStart.length !== 0,
			0x987 /* No transaction to add a step to */,
		);
		const change = this.enricher.updateChangeEnrichments(commit.change, commit.revision);
		this.transactionCommits.push({ ...commit, change });
	}

	public getComposedChange(revision: RevisionTag): TChange {
		assert(this.transactionScopesStart.length === 0, 0x988 /* Transaction not committed */);
		const squashed = this.rebaser.compose(this.transactionCommits);
		const tagged = this.rebaser.changeRevision(squashed, revision);
		this.transactionCommits.length = 0;
		return tagged;
	}
}

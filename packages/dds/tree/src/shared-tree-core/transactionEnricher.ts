/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeRebaser, GraphCommit, RevisionTag } from "../core/index.js";
import type { ChangeEnricherReadonlyCheckout } from "./changeEnricher.js";

/**
 * Utility for producing an enriched commit out of multiple transaction steps
 */
export class TransactionEnricher<TChange> {
	private readonly rebaser: ChangeRebaser<TChange>;
	private readonly enricher: ChangeEnricherReadonlyCheckout<TChange>;
	private readonly transactionCommits: GraphCommit<TChange>[] = [];

	public constructor(
		rebaser: ChangeRebaser<TChange>,
		enricher: ChangeEnricherReadonlyCheckout<TChange>,
	) {
		this.rebaser = rebaser;
		this.enricher = enricher;
	}

	public addTransactionSteps(commit: GraphCommit<TChange>): void {
		const change = this.enricher.updateChangeEnrichments(commit.change, commit.revision);
		this.transactionCommits.push({ ...commit, change });
	}

	public getComposedChange(revision: RevisionTag): TChange {
		const squashed = this.rebaser.compose(this.transactionCommits);
		const tagged = this.rebaser.changeRevision(squashed, revision);
		return tagged;
	}
}

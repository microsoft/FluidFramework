/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { GraphCommit } from "../core/index.js";
import type { ChangeEnricherProvider } from "./changeEnricher.js";
import { hasSome } from "../util/index.js";

/**
 * Utility for enriching commits from a {@link Branch} before these commits are applied and submitted.
 */
export class BranchCommitEnricher<TChange> {
	/**
	 * Maps each local commit to the corresponding enriched commit.
	 * @remarks
	 * Entries are added when the commits are {@link BranchCommitEnricher.prepareChanges | processed during a change}.
	 * Each entry is removed when it is {@link BranchCommitEnricher.retrieveChange | retrieved}.
	 * In the event that an entry is not explicitly removed, it will eventually be {@link WeakMap | dropped from memory} along with the associated commit.
	 */
	private readonly prepared: WeakMap<GraphCommit<TChange>, TChange> = new Map();

	public constructor(private readonly enricherProvider: ChangeEnricherProvider<TChange>) {}

	/**
	 * Process the given commits for later {@link BranchCommitEnricher.retrieveChange | retrieval}.
	 * @param commits - The commits to prepare.
	 */
	public prepareChanges(commits: readonly GraphCommit<TChange>[]): void {
		if (hasSome(commits)) {
			this.enricherProvider.runEnrichmentBatch(commits[0], (enricher) => {
				for (const newCommit of commits) {
					const newChange = enricher.updateChangeEnrichments(
						newCommit.change,
						newCommit.revision,
					);
					this.prepared.set(newCommit, newChange);
					// The last call to this is unnecessary, but has negligible performance impact so long as the enricher is lazy.
					enricher.applyTipChange(newCommit.change, newCommit.revision);
				}
			});
		}
	}

	/**
	 * Retrieves the enriched change for the given commit.
	 * @param commit - A commit already {@link BranchCommitEnricher.prepareChanges | prepared}.
	 * @remarks A commit can only be enriched once - subsequent calls to this method with the same commit will throw an error.
	 */
	public retrieveChange(commit: GraphCommit<TChange>): TChange {
		const prepared = this.prepared.get(commit);
		assert(prepared !== undefined, 0x980 /* Unknown commit */);
		this.prepared.delete(commit);
		return prepared;
	}
}

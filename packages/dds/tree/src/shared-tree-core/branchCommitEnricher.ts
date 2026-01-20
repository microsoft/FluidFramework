/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { GraphCommit } from "../core/index.js";
import type { ChangeEnricher } from "./changeEnricher.js";
import { hasSome } from "../util/index.js";

/**
 * Utility for enriching commits from a {@link Branch} before these commits are applied and submitted.
 */
export class BranchCommitEnricher<TChange> {
	/**
	 * Maps each local commit to the corresponding enriched change.
	 * @remarks
	 * Entries are added when the commits are {@link BranchCommitEnricher.prepareChanges | prepared}.
	 * Each entry is removed when it is {@link BranchCommitEnricher.retrieveChange | retrieved}.
	 * In the event that an entry is not explicitly removed, it will eventually be {@link WeakMap | dropped from memory} along with the associated commit.
	 */
	private readonly prepared: WeakMap<GraphCommit<TChange>, TChange> = new WeakMap();

	public constructor(private readonly enricher: ChangeEnricher<TChange>) {}

	/**
	 * Process the given commits for later {@link BranchCommitEnricher.retrieveChange | retrieval}.
	 * @param commits - The commits to prepare.
	 */
	public prepareChanges(commits: readonly GraphCommit<TChange>[]): void {
		if (hasSome(commits)) {
			const startingState = commits[0].parent;
			assert(startingState !== undefined, 0xcba /* New commits must have a parent. */);
			const enrichedCommits = this.enricher.enrich(startingState, commits);
			for (const [index, commit] of commits.entries()) {
				const enrichedCommit = enrichedCommits[index];
				assert(enrichedCommit !== undefined, 0xcbb /* Missing enriched commit. */);
				this.prepared.set(commit, enrichedCommit);
			}
		}
	}

	/**
	 * Retrieves the enriched change for the given commit.
	 * @param commit - A commit that was already {@link BranchCommitEnricher.prepareChanges | prepared}.
	 * @remarks A commit can only be enriched once - subsequent calls to this method with the same commit will throw an error.
	 * @returns The enriched change corresponding to the given `commit`.
	 */
	public retrieveChange(commit: GraphCommit<TChange>): TChange {
		const prepared = this.prepared.get(commit);
		assert(prepared !== undefined, 0x980 /* Unknown commit */);
		this.prepared.delete(commit);
		return prepared;
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CommitRevision, TreeBranchCommitMetadata } from "./tree.js";

/**
 * Application-supplied policy for deciding whether an intermediate retained state may be compacted away.
 * @remarks
 * Given the metadata for the states immediately before and after a candidate boundary, returns `true` if
 * that boundary may be compacted away (merging `before` into `after`), or `false` to retain it.
 *
 * SharedTree does not interpret the metadata on `before`/`after` itself; it only acts on the boolean
 * returned. It is entirely up to the application to define and read its own metadata shape.
 * @alpha @input
 */
export type CanCompactCommit = (candidate: {
	/**
	 * The boundary whose endpoint would be removed if compacted.
	 */
	readonly before: TreeBranchCommitMetadata;
	/**
	 * The following boundary, which would absorb `before`'s represented commits if compacted.
	 */
	readonly after: TreeBranchCommitMetadata;
}) => boolean;

/**
 * The outcome of a {@link TreeHistoryCompaction.requestCompaction | compaction request}.
 * @sealed @alpha
 */
export interface CompactionResult {
	/**
	 * Whether work was accepted this pass, or why it was not.
	 */
	readonly status: "applied" | "noEligibleHistory" | "deferred";

	/**
	 * The number of intermediate boundaries removed from the exposed history as a result.
	 * @remarks
	 * Currently always `0` or `1`, since at most one boundary pair is merged per
	 * {@link TreeHistoryCompaction.requestCompaction | compaction request}.
	 */
	readonly removedCount: number;
}

/**
 * The outcome of a {@link TreeHistoryCompaction.setRevisionPreserved | preservation request}.
 * @sealed @alpha
 */
export interface RevisionPreservationResult {
	/**
	 * The revision affected by the update.
	 */
	readonly revision: CommitRevision;

	/**
	 * The accepted preserved state.
	 */
	readonly isPreserved: boolean;
}

/**
 * Experimental, application-guided compaction of a branch's retained sequenced history.
 * @remarks
 * Requires the tree to have been created with `enableHistoryCompaction`; this does not migrate
 * legacy documents. Applications observe retained-history changes through the view's
 * `historyChanged` event.
 * @alpha @sealed
 */
export interface TreeHistoryCompaction {
	/**
	 * Requests a single, bounded compaction pass using the given policy.
	 * @param canCompactCommit - Decides, for each eligible candidate boundary, whether it may be compacted away.
	 * @remarks
	 * Only one pass can be in flight per client at a time; a call made while one is already running
	 * coalesces onto the existing in-flight promise rather than starting a competing pass, and its own
	 * `canCompactCommit` argument is not consulted in that case.
	 *
	 * `canCompactCommit` is only ever consulted locally by the client making this request; it is never
	 * invoked again by this or any other client once a resulting proposal has been produced.
	 *
	 * Promise completion acknowledges operation ordering, not summary persistence or memory reclamation.
	 */
	requestCompaction(canCompactCommit: CanCompactCommit): Promise<CompactionResult>;

	/**
	 * Explicitly sets or clears durable preservation on an existing retained sequenced revision, protecting
	 * it from compaction regardless of what {@link CanCompactCommit} would otherwise decide.
	 * @param revision - The revision to update.
	 * @param isPreserved - Whether the revision should be preserved.
	 * @remarks
	 * This preserved state is written to the document summary so it survives reload, and is independent of
	 * any `canCompactCommit` policy.
	 */
	setRevisionPreserved(
		revision: CommitRevision,
		isPreserved: boolean,
	): Promise<RevisionPreservationResult>;
}

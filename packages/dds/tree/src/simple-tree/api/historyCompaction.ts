/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";

import type { JsonCompatibleReadOnlyObject } from "../../util/index.js";

import type { CommitRevision, TreeBranchCommitMetadata } from "./tree.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
import type { SharedTreeOptions } from "../../shared-tree/index.js";

/**
 * Application-supplied policy that reads the tree's retained history and returns the ranges of adjacent commits to combine.
 * @param history - Every sequenced commit in the tree's main history that is not yet trimmed, oldest first.
 * This includes commits that are not yet eligible for compaction, so that the policy can use newer commits as context,
 * for example the newest commit's time as a deterministic reference time.
 * @remarks
 * Each commit in the history is a point in time that the application can show or restore.
 * Each {@link CompactionRange} becomes one commit that has the effect of every commit in the range and keeps the revision of the range's newest commit.
 * The document states after the other commits in the range can no longer be restored.
 * For example, with history `A ← B ← C ← D ← E`, the plan `{ ranges: [{ oldest: B, newest: D }] }` turns it into `A ← (B+C+D) ← E`,
 * where `(B+C+D)` keeps D's revision.
 *
 * **Validation.**
 * SharedTree validates the whole plan before combining anything.
 * A range that names a revision that is not in `history`, whose `oldest` is newer than its `newest`, or that overlaps another range,
 * is a usage error, and nothing is combined.
 *
 * **Which commits can be combined.**
 * A commit is first kept for correctness: while other clients may still be editing concurrently with it, SharedTree needs it to merge their edits.
 * Once every client has seen it (the minimum sequence number has passed it), it is only kept as history, and from then on it is eligible for compaction.
 * The plan cannot affect correctness, because SharedTree skips any range that contains a commit that is still needed to merge edits.
 * In particular, a range is skipped if it contains any of the following:
 *
 * - A commit inside the collaboration window, which other clients may still be editing concurrently with.
 *
 * - A commit that an open branch of this tree (for example a fork of a view) is based on, or any later commit.
 *
 * - A commit marked with {@link TreeHistoryCompaction.setRevisionPreserved}.
 * Compaction does not change a preserved commit's change data or metadata, and does not combine commits across it.
 *
 * The newest eligible commit can be the newest commit of a range, but no range can extend past it, because the commits after it are based on its result.
 * Commits that are not yet sequenced (local edits that the service has not yet ordered) are not in `history`.
 * Commits outside the tree's history retention limit are removed by trimming before compaction runs, so they are not in `history` either.
 * A range with a single commit is skipped, because there is nothing to combine.
 *
 * A skipped range is not an error: the rest of the plan is still applied, and the same plan can succeed in a later pass,
 * once its commits have become eligible.
 *
 * **What a combined commit looks like.**
 * SharedTree does not interpret the application's metadata, and it does not add any metadata of its own that marks a commit as combined.
 * Unless the range provides {@link CompactionRange.metadata}, the combined commit keeps the metadata of every commit it was made from:
 *
 * - {@link TreeBranchCommitMetadata.customTree | customTree} has the metadata trees of the combined commits as descendants, oldest first.
 * A single commit made by nested transactions can have the same shape, so this cannot reliably tell a combined commit apart from such a commit.
 *
 * - {@link TreeBranchCommitMetadata.custom | custom} is the merged metadata: where several commits used the same property, the newest commit's value wins.
 *
 * So a policy that compares a property such as a session ID works unchanged on combined commits,
 * but a policy that needs the oldest value of a property (for example when a run of edits started) must read it from `customTree`,
 * or provide {@link CompactionRange.metadata} that records it.
 *
 * **The commit objects.**
 * The commits in `history` are the same {@link TreeBranchCommitMetadata} that the tree's history APIs return, with these differences:
 *
 * - {@link TreeBranchCommitMetadata.revertTo | revertTo} is always `undefined`, because the policy must not edit the tree while its history is being rewritten.
 *
 * - {@link TreeBranchCommitMetadata.getParent | getParent} walks the tree's main history (not a view's branch), so it only reaches older commits that are not yet trimmed.
 *
 * - They are only valid during the call. Do not keep them: once the plan is applied, some of them no longer exist in the history.
 *
 * The policy must be deterministic with respect to the commit metadata, because every client that runs it (in particular the summarizer) must make the same decisions.
 * @alpha @input
 */
export type PlanCompaction = (history: readonly TreeBranchCommitMetadata[]) => CompactionPlan;

/**
 * The ranges of commits that a {@link PlanCompaction} policy asks SharedTree to combine.
 * @alpha @input
 */
export interface CompactionPlan {
	/**
	 * The ranges to combine. They must not overlap, and may be in any order.
	 */
	readonly ranges: readonly CompactionRange[];
}

/**
 * A run of adjacent commits that a {@link PlanCompaction} policy asks SharedTree to combine into one commit.
 * @alpha @input
 */
export interface CompactionRange {
	/**
	 * The revision of the oldest commit in the range.
	 */
	readonly oldest: CommitRevision;
	/**
	 * The revision of the newest commit in the range. The combined commit keeps this revision.
	 */
	readonly newest: CommitRevision;
	/**
	 * Replaces the metadata of every commit in the range.
	 * @remarks
	 * When provided, the combined commit's {@link TreeBranchCommitMetadata.custom | custom} metadata is this object,
	 * and its {@link TreeBranchCommitMetadata.customTree | customTree} is a single node with no children.
	 * This lets the policy keep exactly what its next decision needs, and keeps the stored metadata from growing each time commits are combined.
	 * For example, a policy that combines edits made within 5 minutes of the first edit of a run can provide
	 * `{ start: oldest.custom.start, end: newest.custom.end }`, so that a later plan sees when the run started.
	 *
	 * The object is stored in the history and summary like any other commit metadata, so it must be a JSON-compatible object.
	 * Once the range is combined, the metadata of the original commits is no longer available.
	 *
	 * When omitted, the combined commit keeps the metadata of every commit in the range; see {@link PlanCompaction}.
	 */
	readonly metadata?: JsonCompatibleReadOnlyObject;
}

/**
 * Configures history compaction that a SharedTree runs each time it writes a summary.
 * @remarks
 * This is how a compaction policy reaches the summarizer client.
 * The summarizer is created from the same application code as other clients, so it constructs its SharedTree with the same options and the same policy.
 * Because the summary is the only history that is persisted, running the policy when summarizing is what reduces storage.
 *
 * The policy runs just before the tree's summary is written, using the same rules as {@link TreeHistoryCompaction.requestPlannedCompaction}.
 * The runtime only asks a SharedTree for a new summary when the tree has processed ops since its last summary,
 * so history that becomes eligible without any new ops for this tree is compacted at the next summary after the tree changes.
 *
 * If the policy throws or returns a malformed plan, the error is logged, nothing is combined, and the summary is still written.
 * @alpha @input
 */
export interface SummaryHistoryCompactionOptions {
	/**
	 * Plans which ranges of commits to combine, reading the whole retained history at once.
	 * @remarks
	 * This must be deterministic with respect to the commit metadata, fast, and free of side effects,
	 * because it runs as part of summarization.
	 * If it throws or returns a malformed plan, the error is logged, nothing is combined, and the summary is still written.
	 *
	 * When omitted, no compaction runs when summarizing.
	 */
	readonly planCompaction?: PlanCompaction;

	/**
	 * Enables {@link TreeHistoryCompaction.setRevisionPreserved}.
	 * @remarks
	 * Preserved revisions are sent to other clients as ops and stored in the summary, which requires an unreleased op and summary format.
	 * Setting this to `true` makes this client write that format.
	 * Every client that loads the document must use a version of SharedTree that can read it, so only enable this for testing and prototyping.
	 *
	 * This option has no effect when experimental shared branches or detached-root editing is enabled;
	 * preserving revisions is not supported together with either feature.
	 *
	 * Defaults to `false`.
	 */
	readonly enableRevisionPreservation?: boolean;
}

/**
 * Experimental, application-guided compaction of a SharedTree's retained history.
 * @remarks
 * Compaction applies to the whole SharedTree, not to a single view or branch.
 * It only affects history that the tree keeps because of its history retention policy.
 * History that is still needed for collaboration or by open branches is never compacted.
 *
 * Compaction requested through this API runs only on the local client.
 * Its result is written to the summary only when this client produces one.
 * To reduce what is persisted, configure the same policy with {@link SharedTreeOptions.historyCompaction} so that it also runs on the summarizer client.
 * @alpha @sealed
 */
export interface TreeHistoryCompaction {
	/**
	 * Runs a compaction pass that combines the ranges of commits chosen by `planCompaction`.
	 * @param planCompaction - Reads the whole retained history and returns the ranges to combine; see {@link PlanCompaction}.
	 * Ranges that contain commits that are still needed for correctness are skipped.
	 * @returns The number of commits removed from the history.
	 * @throws The error thrown by `planCompaction`, or a `UsageError` if the plan is malformed. In either case the history is unchanged.
	 */
	requestPlannedCompaction(planCompaction: PlanCompaction): number;

	/**
	 * Marks or unmarks a revision as preserved, so that history compaction never combines it with another commit.
	 * @param revision - The revision of a commit in the main branch's history, for example from {@link TreeBranchCommitMetadata}.
	 * @param preserved - `true` to preserve the revision, `false` to allow it to be compacted again.
	 * @remarks
	 * The change applies to all clients: it is applied locally right away and sent to other clients (including the summarizer) as an op,
	 * and it is stored in the summary.
	 * A {@link CompactionRange} that contains a preserved revision is skipped, so its change data and metadata remain unchanged by compaction.
	 * Commits on either side can still be compacted, but not across the preserved commit.
	 *
	 * Preserving a revision does not keep it beyond the tree's history retention limit:
	 * when the commit is dropped because of that limit, it is no longer preserved.
	 *
	 * Marking a revision as preserved is optimistic: {@link TreeHistoryCompaction.isRevisionPreserved} returns `true` right away.
	 * If the summarizer client has already compacted or trimmed the revision by the time it receives the request,
	 * it rejects it: every client unmarks the revision, and clients that had it marked raise
	 * {@link TreeHistoryCompactionEvents.revisionPreservationRejected}.
	 * So a revision is only reliably preserved once the request has been sequenced and the summarizer has had a chance to reject it.
	 *
	 * Requires {@link SummaryHistoryCompactionOptions.enableRevisionPreservation}.
	 * @throws A `UsageError` if revision preservation is not enabled,
	 * or if `preserved` is `true` and the revision is not (or is no longer) in the main branch's history.
	 */
	setRevisionPreserved(revision: CommitRevision, preserved: boolean): void;

	/**
	 * Whether the given revision is currently preserved from history compaction.
	 * @remarks See {@link TreeHistoryCompaction.setRevisionPreserved}.
	 */
	isRevisionPreserved(revision: CommitRevision): boolean;

	/**
	 * Events about history compaction. See {@link TreeHistoryCompactionEvents}.
	 */
	readonly events: Listenable<TreeHistoryCompactionEvents>;
}

/**
 * Events raised by {@link TreeHistoryCompaction}.
 * @alpha @sealed
 */
export interface TreeHistoryCompactionEvents {
	/**
	 * Raised when the summarizer client rejects a request to preserve a revision that this client had marked as preserved.
	 * @param revision - The revision that is no longer preserved.
	 * @remarks
	 * The summarizer rejects the request when it no longer has the revision, because it already compacted it or trimmed it
	 * (for example, when this client marked the revision before receiving the summarizer's latest summary).
	 * When this is raised, {@link TreeHistoryCompaction.isRevisionPreserved} already returns `false` for the revision,
	 * on this client and every other client.
	 * The revision will not be available after the document is reloaded.
	 *
	 * This can be raised for a revision that another client marked as preserved, and can be raised more than once for the same revision.
	 */
	revisionPreservationRejected(revision: CommitRevision): void;
}

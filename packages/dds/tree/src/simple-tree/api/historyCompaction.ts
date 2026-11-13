/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonCompatibleReadOnlyObject } from "../../util/index.js";

import type { CommitRevision, TreeBranchCommitMetadata } from "./tree.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
import type { SharedTreeOptions } from "../../shared-tree/index.js";

/**
 * Application-supplied policy that decides whether two adjacent commits in the tree's history may be combined into one.
 * @remarks
 * Each commit in the history is a point in time that the application can show or restore.
 * Returning `true` combines `current` into `target`: the combined commit has the effect of both commits and keeps `target`'s revision,
 * but the document state right after `current` (the state between the two commits) can no longer be restored.
 * Returning `false` keeps both points in time.
 * Returning an object also combines the commits, and makes that object the combined commit's metadata (see "Choosing the combined commit's metadata" below).
 *
 * **When the policy is called.**
 * A commit is first kept for correctness: while other clients may still be editing concurrently with it, SharedTree needs it to merge their edits.
 * Once every client has seen it (the minimum sequence number has passed it), it is only kept as history, and from then on SharedTree may ask about it.
 * For example, with history `A ← B ← C ← D ← E`, where A to C are history only and D and E are still needed for correctness:
 *
 * 1. Every client sees D, so D becomes history only. SharedTree asks `canCompactCommit({ current: C, target: D })`.
 * If the policy returns `false`, the history stays `A ← B ← C ← D ← E`. If it returns `true`, it becomes `A ← B ← (C+D) ← E`.
 *
 * 2. Later, E becomes history only. If C and D were combined, SharedTree asks about `(C+D)` and `E`; otherwise it asks about `D` and `E`.
 *
 * If several commits become history only at once, SharedTree asks about them oldest first, and a combined commit is always the `current` of the next question.
 * This is how a run of `true` answers combines several commits into one.
 * SharedTree does not remember earlier answers: a pass may ask again about pairs the policy declined before, so the policy must give the same answer for the same metadata.
 *
 * **What the policy is never asked about.**
 * The policy cannot affect correctness, because SharedTree never offers a commit that is still needed to merge edits.
 * In particular, `current` is never one of the following:
 *
 * - A commit that is not yet sequenced (a local edit that the service has not yet ordered).
 *
 * - A commit inside the collaboration window, which other clients may still be editing concurrently with.
 *
 * - A commit that an open branch of this tree (for example a fork of a view) is based on, or any later commit.
 *
 * - The newest commit that is history only, because the commits after it are based on its result. It can only be `target`.
 *
 * A commit marked with {@link TreeHistoryCompaction.setRevisionPreserved} is never offered as either `current` or `target`.
 * Compaction does not change its change data or metadata, and does not combine commits across it.
 *
 * Commits outside the tree's history retention limit are removed by trimming before compaction runs, so they are never offered either.
 *
 * **What a combined commit looks like.**
 * SharedTree does not interpret the application's metadata, and it does not add any metadata of its own that marks a commit as combined.
 * Instead, when the policy returns `true`, the combined commit keeps the metadata of every commit it was made from:
 *
 * - {@link TreeBranchCommitMetadata.customTree | customTree} has the metadata trees of the combined commits as children, oldest first.
 * For `(C+D)`, it has a child for C and a child for D, and no metadata of its own.
 * A single commit made by nested transactions can have the same shape, so this cannot reliably tell a combined commit apart from such a commit.
 *
 * - {@link TreeBranchCommitMetadata.custom | custom} is the merged metadata: where both commits used the same property, the newer commit's value wins.
 * For `(C+D)`, a property that both C and D set has D's value.
 *
 * So a policy that compares a property such as a session ID works unchanged on combined commits,
 * but a policy that needs the oldest value of a property (for example when a run of edits started) must read it from `customTree`.
 *
 * **Choosing the combined commit's metadata.**
 * Instead of `true`, the policy may return an object to use as the combined commit's metadata.
 * The object replaces the metadata of both commits: the combined commit's `custom` is that object, and its `customTree` is a single node with no children.
 * This lets the policy keep exactly what its next decision needs, and keeps the stored metadata from growing with each combination.
 * For example, a policy that combines edits made within 5 minutes of the first edit of a run can return
 * `{ start: current.custom.start, end: target.custom.end }`, so the next question about `(C+D)` sees when the run started.
 *
 * The object is stored in the history and summary like any other commit metadata, so it must be JSON-compatible.
 * Like the decision itself, it must depend only on `current` and `target`.
 * Once returned, the metadata of the original commits is no longer available.
 *
 * **The commit objects.**
 * `current` and `target` are the same {@link TreeBranchCommitMetadata} that the tree's history APIs return, with these differences:
 *
 * - {@link TreeBranchCommitMetadata.revertTo | revertTo} is always `undefined`, because the policy must not edit the tree while its history is being rewritten.
 *
 * - {@link TreeBranchCommitMetadata.getParent | getParent} walks the tree's main history (not a view's branch), so it only reaches older commits that are not yet trimmed.
 *
 * - They are only valid during the call. Do not keep them: once the pass continues, `current` may no longer exist in the history.
 * @alpha @input
 */
export type CanCompactCommit = (candidate: {
	/**
	 * The older of the two adjacent commits. This commit is removed from the history if the commits are combined.
	 * @remarks
	 * This may be a commit that earlier compaction already combined, such as `(C+D)` in the example above.
	 */
	readonly current: TreeBranchCommitMetadata;
	/**
	 * The commit that immediately follows `current`. If the commits are combined, this commit absorbs `current` and keeps its own revision.
	 */
	readonly target: TreeBranchCommitMetadata;
}) => boolean | JsonCompatibleReadOnlyObject;

/**
 * Configures history compaction that a SharedTree runs each time it writes a summary.
 * @remarks
 * This is how a compaction policy reaches the summarizer client.
 * The summarizer is created from the same application code as other clients, so it constructs its SharedTree with the same options and the same policy.
 * Because the summary is the only history that is persisted, running the policy when summarizing is what reduces storage.
 *
 * The policy runs just before the tree's summary is written, using the same rules as {@link TreeHistoryCompaction.requestCompaction}.
 * The runtime only asks a SharedTree for a new summary when the tree has processed ops since its last summary,
 * so history that becomes eligible without any new ops for this tree is compacted at the next summary after the tree changes.
 *
 * If the policy throws, the error is logged, any pairs already combined stay combined, and the summary is still written.
 * @alpha @input
 */
export interface SummaryHistoryCompactionOptions {
	/**
	 * Decides, for each pair of adjacent eligible commits, whether they may be combined.
	 * @remarks
	 * This must be deterministic with respect to the commit metadata, fast, and free of side effects,
	 * because it runs as part of summarization.
	 *
	 * When omitted, no compaction runs when summarizing.
	 */
	readonly canCompactCommit?: CanCompactCommit;

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
	 * Runs a compaction pass over the eligible history, oldest first.
	 * @param canCompactCommit - Decides, for each pair of adjacent eligible commits, whether they may be combined.
	 * After a pair is combined, the next pair is the combined commit and the commit after it.
	 * This lets the application combine a run of several commits.
	 * Commits that are still needed for correctness are never offered to the policy; see {@link CanCompactCommit}.
	 * @returns The number of commits removed from the history by combining them into the commit after them.
	 */
	requestCompaction(canCompactCommit: CanCompactCommit): number;

	/**
	 * Marks or unmarks a revision as preserved, so that history compaction never combines it with another commit.
	 * @param revision - The revision of a commit in the main branch's history, for example from {@link TreeBranchCommitMetadata}.
	 * @param preserved - `true` to preserve the revision, `false` to allow it to be compacted again.
	 * @remarks
	 * The change applies to all clients: it is applied locally right away and sent to other clients (including the summarizer) as an op,
	 * and it is stored in the summary.
	 * A preserved revision is never passed to a compaction policy as either `current` or `target`.
	 * Its change data and metadata remain unchanged by compaction.
	 * Commits on either side can still be compacted, but not across the preserved commit.
	 *
	 * Preserving a revision does not keep it beyond the tree's history retention limit:
	 * when the commit is dropped because of that limit, it is no longer preserved.
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
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { GraphCommit, RevisionTag } from "../core/index.js";

/**
 * Tracks the never-submitted suffix of a local branch and the prefix authorized for submission.
 * @remarks
 * This class has no knowledge of schema or data. Its policy is evaluated only when local commits
 * are appended, unless the caller bypasses the policy.
 * Rebase and remote sequencing do not themselves authorize publication.
 *
 * Only revisions are retained: the caller resolves them against current local history before
 * enrichment. Keeping the original commit objects would submit stale changes after rebase.
 */
export class CommitSubmissionBuffer<TChange> {
	/** Never-submitted revisions in local authoring order, including any untriggered suffix. */
	private readonly revisions: RevisionTag[] = [];
	/** Prefix length authorized by the most recent trigger, adjusted as entries leave the queue. */
	private readyCount = 0;

	/**
	 * @param bufferCommitsUntil - Returns true when a newly appended change authorizes submission of the
	 * buffered prefix through that change. Must not mutate the branch or submit operations.
	 */
	public constructor(private readonly bufferCommitsUntil: (change: TChange) => boolean) {}

	/** Whether any local commits remain outside the runtime's pending-operation queue. */
	public get hasPending(): boolean {
		return this.revisions.length > 0;
	}

	/**
	 * Checks whether a revision has not yet been submitted.
	 * Used to exclude private work from reconnect resubmission.
	 */
	public has(revision: RevisionTag): boolean {
		return this.revisions.includes(revision);
	}

	/**
	 * Adds committed local history in authoring order.
	 * A merge can contain a trigger followed by more held changes; only its triggered prefix is ready.
	 * @param commits - Appended local commits.
	 * @param bypassBuffer - If true, mark all appended commits ready, ignoring the configured buffering policy.
	 * Detached commits must be sequenced locally without waiting for a later edit.
	 * Runtime pending-state replay must restore submission without applying the current policy again.
	 * The caller must still validate ready commits before submitting them.
	 */
	public enqueue(commits: readonly GraphCommit<TChange>[], bypassBuffer = false): void {
		for (const commit of commits) {
			assert(!this.has(commit.revision), "A local revision must not be buffered twice.");
			this.revisions.push(commit.revision);
			if (bypassBuffer || this.bufferCommitsUntil(commit.change)) {
				this.readyCount = this.revisions.length;
			}
		}
	}

	/**
	 * Resolves the ready prefix to the latest rebased commits without consuming it.
	 * @param localCommits - Current local history, including submitted and never-submitted commits.
	 * @returns The authorized commits in their original order.
	 */
	public getReadyCommits(
		localCommits: readonly GraphCommit<TChange>[],
	): GraphCommit<TChange>[] {
		if (this.readyCount === 0) return [];
		const current = new Map(localCommits.map((commit) => [commit.revision, commit]));
		return this.revisions.slice(0, this.readyCount).map((revision) => {
			const commit = current.get(revision);
			assert(
				commit !== undefined,
				"Buffered commit must remain in local history until submitted or cancelled.",
			);
			return commit;
		});
	}

	/**
	 * Releases a revision after submission, cancellation, or acknowledgement through another branch.
	 * @remarks
	 * Removal is idempotent because detached sequencing can acknowledge during submission.
	 * It does not make a later, untriggered suffix ready.
	 */
	public remove(revision: RevisionTag): void {
		const index = this.revisions.indexOf(revision);
		if (index !== -1) {
			this.revisions.splice(index, 1);
			if (index < this.readyCount) this.readyCount--;
		}
	}
}

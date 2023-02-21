/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeRebaser, TaggedChange, tagInverse } from "./changeRebaser";
import type { GraphCommit } from "./types";
import { findCommonAncestor } from "./utils";

/**
 * Handles the rebasing of commits in the commit graph and their changes
 */
export class Rebaser<TChange> {
	/**
	 * @param changeRebaser - the change rebaser responsible for rebasing the changes in the commits given to this rebaser
	 */
	public constructor(public readonly changeRebaser: ChangeRebaser<TChange>) {}

	/**
	 * Rebases a branch (the source) onto another branch (the target).
	 *
	 * Given a commit as the "head", a branch is defined as the ancestry path of that head commit.
	 * The source and target branch must share an ancestor. Respectively, they must not contain any commits
	 * in their path with duplicate tags, or this function will have undefined behavior.
	 * @param source - the head of a branch to rebase
	 * @param targetBase - the commit to rebase `source` onto
	 * @param targetBranch - An optional head of the branch that `targetBase` belongs to. If this branch contains commits
	 * past `targetBase` that are semantically equivalent to commits in `source`, then this function will rebase over
	 * those commits as well (rebasing over and past `targetBase`).
	 * @returns the head of a rebased source branch and the cumulative change to the source branch
	 */
	public rebaseBranch(
		source: GraphCommit<TChange>,
		targetBase: GraphCommit<TChange>,
		targetBranch = targetBase,
	): [newSource: GraphCommit<TChange>, sourceChange: TChange] {
		// Get both source and target as path arrays
		const sourcePath: GraphCommit<TChange>[] = [];
		const targetPath: GraphCommit<TChange>[] = [];
		const ancestor = findCommonAncestor([source, sourcePath], [targetBranch, targetPath]);
		assert(ancestor !== undefined, "branch A and branch B must be related");

		// Find where `base` is in the target branch
		const baseIndex = targetPath.findIndex((r) => r === targetBase);
		if (baseIndex === -1) {
			// If the base is not in the target path, then it is either disjoint from `target` or it is behind/at
			// the commit where source and target diverge (ancestor), in which case there is nothing more to rebase
			// TODO: Ideally, this would be an "assertExpensive"
			assert(
				findCommonAncestor(targetBase, targetBranch) !== undefined,
				"base is not in target branch",
			);
			return [source, this.changeRebaser.compose([])];
		}

		// Iterate through the target path and look for commits that are also present on the source branch (i.e. they
		// have matching tags). Each commit found in the target branch can be skipped when processing the source branch
		// because it has already been rebased onto the target. In the case that one or more of these commits are present
		// directly after `base`, then the base can be advanced further without having to do any work.
		const sourceSet = new Set(sourcePath.map((r) => r.revision));
		let effectiveBaseIndex = baseIndex;
		for (let t = 0; t < targetPath.length; t += 1) {
			const r = targetPath[t].revision;
			if (sourceSet.has(r)) {
				effectiveBaseIndex = Math.max(effectiveBaseIndex, t);
				sourceSet.delete(r);
			} else if (t >= baseIndex) {
				break;
			}
		}

		// Figure out how much of the trunk to start rebasing over.
		const targetRebasePath = targetPath.slice(0, effectiveBaseIndex + 1);
		let effectiveBase = targetPath[effectiveBaseIndex];

		// For each source commit, rebase backwards over the inverses of any commits already rebased, and then
		// rebase forwards over the rest of the commits up to the new base before advancing the new base.
		const inverses: TaggedChange<TChange>[] = [];
		for (const c of sourcePath) {
			if (sourceSet.has(c.revision)) {
				let change = this.rebaseChangeOverChanges(c.change, inverses);
				change = this.rebaseChangeOverCommits(change, targetRebasePath);
				effectiveBase = {
					revision: c.revision,
					sessionId: c.sessionId,
					change,
					parent: effectiveBase,
				};
				targetRebasePath.push({ ...c, change });
			}
			inverses.unshift(tagInverse(this.changeRebaser.invert(c), c.revision));
		}

		// Compose all changes together to get a single change that represents the entire rebase operation
		return [effectiveBase, this.changeRebaser.compose([...inverses, ...targetRebasePath])];
	}

	/**
	 * Rebase a change over the given source and target branches
	 * @param change - the change to rebase
	 * @param source - the branch that `change` is based on
	 * @param target - the branch to rebase `change` onto
	 * @returns the rebased change
	 */
	public rebaseChange(
		change: TChange,
		source: GraphCommit<TChange>,
		target: GraphCommit<TChange>,
	): TChange {
		const sourcePath: GraphCommit<TChange>[] = [];
		const targetPath: GraphCommit<TChange>[] = [];
		assert(
			findCommonAncestor([source, sourcePath], [target, targetPath]) !== undefined,
			"branch A and branch B must be related",
		);

		const changeRebasedToRef = sourcePath.reduceRight(
			(newChange, branchCommit) =>
				this.changeRebaser.rebase(newChange, this.inverseFromCommit(branchCommit)),
			change,
		);

		return targetPath.reduce((a, b) => this.changeRebaser.rebase(a, b), changeRebasedToRef);
	}

	private rebaseChangeOverCommits(changeToRebase: TChange, commits: GraphCommit<TChange>[]) {
		return this.rebaseChangeOverChanges(changeToRebase, commits);
	}

	private rebaseChangeOverChanges(
		changeToRebase: TChange,
		changesToRebaseOver: TaggedChange<TChange>[],
	) {
		return changesToRebaseOver.reduce(
			(a, b) => this.changeRebaser.rebase(a, b),
			changeToRebase,
		);
	}

	private inverseFromCommit(commit: GraphCommit<TChange>): TaggedChange<TChange> {
		return tagInverse(this.changeRebaser.invert(commit), commit.revision);
	}
}

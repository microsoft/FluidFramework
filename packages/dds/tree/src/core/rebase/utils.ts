/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";

import { defineLazyCachedProperty, hasSome, type Mutable } from "../../util/index.js";

import {
	type ChangeRebaser,
	type RevisionInfo,
	type RevisionMetadataSource,
	type TaggedChange,
	makeAnonChange,
	mapTaggedChange,
	tagChange,
	tagRollbackInverse,
} from "./changeRebaser.js";
import { type GraphCommit, type RevisionTag, mintCommit } from "./types.js";

/**
 * Contains information about how the commit graph changed as the result of rebasing a source branch onto another target branch.
 * @remarks
 * ```text
 * Consider the commit graph below containing two branches, X and Y, with head commits C and E, respectively.
 * Branch Y branches off of Branch X at their common ancestor commit A, i.e. "Y is based off of X at commit A".
 *
 *   A ─ B ─ C ← Branch X
 *   └─ D ─ E ← Branch Y
 *
 * Branch Y is then rebased onto Branch X. This results in the following commit graph:
 *
 *   A ─ B ─ C ← Branch X
 *           └─ D'─ E'← Branch Y
 *
 * Commits D' and E' are the rebased versions of commits D and E, respectively. This results in:
 * deletedSourceCommits: [D, E],
 * targetCommits: [B, C],
 * sourceCommits: [D', E']
 * ```
 */
export interface RebasedCommits<TChange> {
	/**
	 * The commits on the original source branch that were rebased. These are no longer referenced by the source branch and have
	 * been replaced with new versions on the new source branch, see {@link sourceCommits}. In the case that the source
	 * branch was already ahead of the target branch before the rebase, this list will be empty.
	 */
	deletedSourceCommits: GraphCommit<TChange>[];
	/**
	 * All commits on the target branch that the source branch's commits were rebased over. These are now the direct
	 * ancestors of {@link sourceCommits}. In the case that the source branch was already ahead of the target branch
	 * before the rebase, this list will be empty.
	 */
	targetCommits: GraphCommit<TChange>[];
	/**
	 * All commits on the source branch that are not also on the target branch after the rebase operation. In the case that the
	 * source branch was already ahead of the target branch before the rebase, these are the same commits that were already on
	 * the source branch before the rebase, otherwise these are the new, rebased versions of {@link deletedSourceCommits}.
	 */
	sourceCommits: GraphCommit<TChange>[];
}

/**
 * Telemetry metrics for a rebase operation.
 */
export interface RebaseStats {
	/**
	 * The length of the source branch before the rebase.
	 */
	readonly sourceBranchLength: number;
	/**
	 * Number of commits rebased over on the target branch.
	 */
	readonly rebaseDistance: number;
	/**
	 * The number of commits that are dropped from the source branch when rebased to the target branch.
	 */
	readonly countDropped: number;
}

export interface RebaseStatsWithDuration extends RebaseStats {
	readonly duration: number;
}

export interface BranchRebaseResult<TChange> {
	/**
	 * The head of a rebased source branch.
	 */
	readonly newSourceHead: GraphCommit<TChange>;
	/**
	 * A thunk that computes the cumulative change to the source branch (undefined if no change occurred)
	 */
	readonly sourceChange: TChange | undefined;
	/**
	 * Details about how the commits on the source branch changed
	 */
	readonly commits: RebasedCommits<TChange>;
	/**
	 * Telemetry properties for the rebase operation.
	 */
	readonly telemetryProperties: RebaseStats;
}

interface RebaseChangeResult<TChange> {
	readonly change: TChange;
	/**
	 * Telemetry properties for the rebase operation.
	 */
	readonly telemetryProperties: RebaseStats;
}

/**
 * Rebases a source branch onto another commit in a target branch.
 *
 * A "branch" is defined as a "head" commit and all ancestors of that commit, i.e. one linked list in a graph of commits.
 *
 * The source and target branch must share an ancestor.
 * @param changeRebaser - the change rebaser responsible for rebasing the changes in the commits of each branch
 * @param sourceHead - the head of the source branch, which will be rebased onto `targetHead`
 * @param targetHead - the commit to rebase the source branch onto
 * @returns a {@link BranchRebaseResult}
 * @remarks While a single branch must not have multiple commits with the same revision tag (that will result in undefined
 * behavior), there may be a commit on the source branch with the same revision tag as a commit on the target branch. If such
 * a pair is encountered while rebasing, it will be "cancelled out" in the new branch. For example:
 * ```
 * // (A)-(B)-(C) <- Branch X
 * //   \
 * //   (B')-(D) <- Branch Y
 * //
 * // As Branch Y is rebased onto Branch X, commits B and B' cancel out so there is no version of B on the new rebased source branch
 * //
 * // (A)-(B)-(C) <- Branch X
 * //           \
 * //           (D') <- Branch Y'
 * //
 * ```
 */
export function rebaseBranch<TChange>(
	mintRevisionTag: () => RevisionTag,
	changeRebaser: ChangeRebaser<TChange>,
	sourceHead: GraphCommit<TChange>,
	targetHead: GraphCommit<TChange>,
): BranchRebaseResult<TChange>;

/**
 * Rebases a source branch onto another commit in a target branch.
 *
 * A "branch" is defined as a "head" commit and all ancestors of that commit, i.e. one linked list in a graph of commits.
 *
 * The source and target branch must share an ancestor.
 * @param changeRebaser - the change rebaser responsible for rebasing the changes in the commits of each branch
 * @param sourceHead - the head of the source branch, which will be rebased onto `newBase`
 * @param targetCommit - the commit on the target branch to rebase the source branch onto.
 * @param targetHead - the head of the branch that `newBase` belongs to. Must be `newBase` or a descendent of `newBase`.
 * @returns a {@link BranchRebaseResult}
 * @remarks While a single branch must not have multiple commits with the same revision tag (that will result in undefined
 * behavior), there may be a commit on the source branch with the same revision tag as a commit on the target branch. If such
 * a pair is encountered while rebasing, it will be "cancelled out" in the new branch. Additionally, this function will rebase
 * the source branch _farther_ than `newBase` if the source branch's next commits after `newBase` match those on the target branch.
 * For example:
 * ```
 * // (A)-(B)-(C)-(D)-(E) <- Branch X
 * //   \
 * //   (B')-(D')-(F) <- Branch Y
 * //
 * // If Branch Y is rebased onto commit C of Branch X, the branches must at least look like this afterwards (B was cancelled out):
 * //
 * // (A)-(B)-(C)-(D)-(E) <- Branch X
 * //           \
 * //           (D'')-(F') <- Branch Y'
 * //
 * // But this function will recognize that B is equivalent to B' and D is equivalent to D', and instead produce:
 * //
 * // (A)-(B)-(C)-(D)-(E) <- Branch X
 * //               \
 * //               (F') <- Branch Y'
 * ```
 */
export function rebaseBranch<TChange>(
	mintRevisionTag: () => RevisionTag,
	changeRebaser: ChangeRebaser<TChange>,
	sourceHead: GraphCommit<TChange>,
	targetCommit: GraphCommit<TChange>,
	targetHead: GraphCommit<TChange>,
): BranchRebaseResult<TChange>;
export function rebaseBranch<TChange>(
	mintRevisionTag: () => RevisionTag,
	changeRebaser: ChangeRebaser<TChange>,
	sourceHead: GraphCommit<TChange>,
	targetCommit: GraphCommit<TChange>,
	targetHead = targetCommit,
): BranchRebaseResult<TChange> {
	// Get both source and target as path arrays
	const sourcePath: GraphCommit<TChange>[] = [];
	const targetPath: GraphCommit<TChange>[] = [];
	const ancestor = findCommonAncestor([sourceHead, sourcePath], [targetHead, targetPath]);
	assert(ancestor !== undefined, 0x675 /* branches must be related */);

	const sourceBranchLength = sourcePath.length;

	// Find where `targetCommit` is in the target branch
	const targetCommitIndex = targetPath.findIndex((r) => r === targetCommit);
	if (targetCommitIndex === -1) {
		// If the targetCommit is not in the target path, then it is either disjoint from `target` or it is behind/at
		// the commit where source and target diverge (ancestor), in which case there is nothing more to rebase
		// TODO: Ideally, this would be an "assertExpensive". It is commented out because it causes O(N²) behavior when
		// processing N inbound commits from the same client whose ref seq# is not advancing (which is a common case).
		// N can be large when the client is sending a burst of changes (potentially on reconnection).
		// assert(
		// 	findCommonAncestor(targetCommit, targetHead) !== undefined,
		// 	0x676 /* target commit is not in target branch */,
		// );
		return {
			newSourceHead: sourceHead,
			sourceChange: undefined,
			commits: { deletedSourceCommits: [], targetCommits: [], sourceCommits: sourcePath },
			telemetryProperties: {
				sourceBranchLength,
				rebaseDistance: targetCommitIndex + 1,
				countDropped: 0,
			},
		};
	}

	// Iterate through the target path and look for commits that are also present on the source branch (i.e. they
	// have matching tags). Each commit found in the target branch can be skipped when processing the source branch
	// because it has already been rebased onto the target. In the case that one or more of these commits are present
	// directly after `targetCommit`, then the new base can be advanced further without having to do any work.
	const sourceSet = new Set(sourcePath.map((r) => r.revision));
	let newBaseIndex = targetCommitIndex;

	for (const [i, { revision }] of targetPath.entries()) {
		if (sourceSet.has(revision)) {
			sourceSet.delete(revision);
			newBaseIndex = Math.max(newBaseIndex, i);
		} else if (i > targetCommitIndex) {
			break;
		}
	}

	/** The commit on the target branch that the new source branch branches off of (i.e. the new common ancestor) */
	const newBase = targetPath[newBaseIndex] ?? oob();
	// Figure out how much of the trunk to start rebasing over.
	const targetCommits = targetPath.slice(0, newBaseIndex + 1);
	const deletedSourceCommits = [...sourcePath];

	// If the source and target rebase path begin with a range that has all the same revisions, remove it; it is
	// equivalent on both branches and doesn't need to be rebased.
	const targetRebasePath = [...targetCommits];
	if (hasSome(sourcePath) && hasSome(targetRebasePath)) {
		const minLength = Math.min(sourcePath.length, targetRebasePath.length);
		for (let i = 0; i < minLength; i++) {
			const firstSourcePath = sourcePath[0];
			const firstTargetRebasePath = targetRebasePath[0];
			if (firstSourcePath.revision === firstTargetRebasePath.revision) {
				sourcePath.shift();
				targetRebasePath.shift();
			}
		}
	}

	const sourceCommits: GraphCommit<TChange>[] = [];

	// If all commits that are about to be rebased over on the target branch already comprise the start of the source branch,
	// are in the same order, and have no other commits interleaving them, then no rebasing needs to occur. Those commits can
	// simply be removed from the source branch, and the remaining commits on the source branch are reparented off of the new
	// base commit.
	if (!hasSome(targetRebasePath)) {
		for (const c of sourcePath) {
			sourceCommits.push(mintCommit(sourceCommits[sourceCommits.length - 1] ?? newBase, c));
		}
		return {
			newSourceHead: sourceCommits[sourceCommits.length - 1] ?? newBase,
			sourceChange: undefined,
			commits: {
				deletedSourceCommits,
				targetCommits,
				sourceCommits,
			},
			telemetryProperties: {
				sourceBranchLength,
				rebaseDistance: targetCommits.length,
				countDropped: sourceBranchLength - sourceSet.size,
			},
		};
	}

	// For each source commit, rebase backwards over the inverses of any commits already rebased, and then
	// rebase forwards over the rest of the commits up to the new base before advancing the new base.
	let newHead = newBase;
	const revInfos = getRevInfoFromTaggedChanges([...targetRebasePath, ...sourcePath]);
	// Note that the `revisionMetadata` gets updated as `revInfos` gets updated.
	const revisionMetadata = revisionMetadataSourceFromInfo(revInfos);
	let editsToCompose: TaggedChange<TChange>[] = targetRebasePath.slice();
	for (const c of sourcePath) {
		const rollback = rollbackFromCommit(changeRebaser, c, mintRevisionTag, false);
		if (sourceSet.has(c.revision)) {
			const currentComposedEdit = makeAnonChange(changeRebaser.compose(editsToCompose));
			editsToCompose = [currentComposedEdit];
			const change = changeRebaser.rebase(c, currentComposedEdit, revisionMetadata);
			newHead = {
				revision: c.revision,
				change,
				parent: newHead,
			};
			sourceCommits.push(newHead);
			editsToCompose.push(tagChange(change, c.revision));
		}
		revInfos.push({ revision: c.revision });
		editsToCompose.unshift(rollback);
		revInfos.unshift({ revision: rollback.revision, rollbackOf: rollback.rollbackOf });
	}

	return defineLazyCachedProperty(
		{
			newSourceHead: newHead,
			commits: {
				deletedSourceCommits,
				targetCommits,
				sourceCommits,
			},
			telemetryProperties: {
				sourceBranchLength,
				rebaseDistance: targetCommits.length,
				countDropped: sourceBranchLength - sourceSet.size,
			},
		},
		"sourceChange",
		() => changeRebaser.compose(editsToCompose),
	);
}

/**
 * "Sandwich/Horseshoe Rebase" a change over the given source and target branches
 * @param changeRebaser - the change rebaser responsible for rebasing the change over the commits in each branch
 * @param change - the change to rebase
 * @param sourceHead - the head of the branch that `change` is based on
 * @param targetHead - the branch to rebase `change` onto
 * @returns the rebased change
 *
 * @remarks inverses will be cached.
 */
export function rebaseChange<TChange>(
	changeRebaser: ChangeRebaser<TChange>,
	change: TaggedChange<TChange>,
	sourceHead: GraphCommit<TChange>,
	targetHead: GraphCommit<TChange>,
	mintRevisionTag: () => RevisionTag,
): RebaseChangeResult<TChange> {
	const sourcePath: GraphCommit<TChange>[] = [];
	const targetPath: GraphCommit<TChange>[] = [];
	assert(
		findCommonAncestor([sourceHead, sourcePath], [targetHead, targetPath]) !== undefined,
		0x576 /* branch A and branch B must be related */,
	);

	const inverses = sourcePath.map((commit) =>
		rollbackFromCommit(changeRebaser, commit, mintRevisionTag, true),
	);
	inverses.reverse();

	const telemetryProperties = {
		sourceBranchLength: 1,
		rebaseDistance: sourcePath.length + targetPath.length,
		countDropped: 0,
	};

	return {
		change: rebaseChangeOverChanges(changeRebaser, change, [...inverses, ...targetPath]),
		telemetryProperties,
	};
}

/**
 */
export function revisionMetadataSourceFromInfo(
	revInfos: readonly RevisionInfo[],
): RevisionMetadataSource {
	const getIndex = (revision: RevisionTag): number | undefined => {
		const index = revInfos.findIndex((revInfo) => revInfo.revision === revision);
		return index >= 0 ? index : undefined;
	};
	const tryGetInfo = (revision: RevisionTag | undefined): RevisionInfo | undefined => {
		if (revision === undefined) {
			return undefined;
		}
		const index = getIndex(revision);
		return index === undefined ? undefined : revInfos[index];
	};

	const hasRollback = (revision: RevisionTag): boolean => {
		return revInfos.find((info) => info.rollbackOf === revision) !== undefined;
	};

	return { getIndex, tryGetInfo, hasRollback };
}

export function rebaseChangeOverChanges<TChange>(
	changeRebaser: ChangeRebaser<TChange>,
	changeToRebase: TaggedChange<TChange>,
	changesToRebaseOver: TaggedChange<TChange>[],
): TChange {
	const revisionMetadata = revisionMetadataSourceFromInfo(
		getRevInfoFromTaggedChanges([...changesToRebaseOver, changeToRebase]),
	);

	return changesToRebaseOver.reduce(
		(a, b) => mapTaggedChange(changeToRebase, changeRebaser.rebase(a, b, revisionMetadata)),
		changeToRebase,
	).change;
}

// TODO: Deduplicate
function getRevInfoFromTaggedChanges(changes: TaggedChange<unknown>[]): RevisionInfo[] {
	const revInfos: RevisionInfo[] = [];
	for (const taggedChange of changes) {
		revInfos.push(...revisionInfoFromTaggedChange(taggedChange));
	}

	return revInfos;
}

// TODO: Deduplicate
function revisionInfoFromTaggedChange(taggedChange: TaggedChange<unknown>): RevisionInfo[] {
	const revInfos: RevisionInfo[] = [];
	if (taggedChange.revision !== undefined) {
		const info: Mutable<RevisionInfo> = { revision: taggedChange.revision };
		if (taggedChange.rollbackOf !== undefined) {
			info.rollbackOf = taggedChange.rollbackOf;
		}
		revInfos.push(info);
	}
	return revInfos;
}

function rollbackFromCommit<TChange>(
	changeRebaser: ChangeRebaser<TChange>,
	commit: GraphCommit<TChange>,
	mintRevisionTag: () => RevisionTag,
	cache?: boolean,
): TaggedChange<TChange, RevisionTag> {
	const rollback = Rollback.get(commit);
	if (rollback !== undefined) {
		return rollback;
	}
	const tag = mintRevisionTag();
	const untagged = changeRebaser.invert(commit, true, tag);
	const deeplyTaggedRollback = changeRebaser.changeRevision(untagged, tag, commit.revision);
	const fullyTaggedRollback = tagRollbackInverse(deeplyTaggedRollback, tag, commit.revision);

	if (cache === true) {
		Rollback.set(commit, fullyTaggedRollback);
	}
	return fullyTaggedRollback;
}

/**
 * Find the furthest ancestor of some descendant.
 * @param descendant - a descendant. If an empty `path` array is included, it will be populated
 * with the chain of ancestry for `descendant` from most distant to closest (not including the furthest ancestor,
 * but otherwise including `descendant`).
 * @returns the furthest ancestor of `descendant`, or `descendant` itself if `descendant` has no ancestors.
 */
export function findAncestor<T extends { parent?: T }>(
	descendant: T | [descendant: T, path?: T[]],
): T;
/**
 * Find the furthest ancestor of some descendant.
 * @param descendant - a descendant. If an empty `path` array is included, it will be populated
 * with the chain of ancestry for `descendant` from most distant to closest (not including the furthest ancestor,
 * but otherwise including `descendant`).
 * @returns the furthest ancestor of `descendant`, or `descendant` itself if `descendant` has no ancestors. Returns
 * `undefined` if `descendant` is undefined.
 */
export function findAncestor<T extends { parent?: T }>(
	descendant: T | [descendant: T | undefined, path?: T[]] | undefined,
): T | undefined;
/**
 * Find an ancestor of some descendant.
 * @param descendant - a descendant. If an empty `path` array is included, it will be populated
 * with the chain of ancestry for `descendant` from most distant to closest (not including the ancestor found by `predicate`,
 * but otherwise including `descendant`).
 * @param predicate - a function which will be evaluated on `descendant` and then ancestor of `descendant` (in ascending order) until it returns true.
 * @returns the closest ancestor of `descendant` that satisfies `predicate`, or `undefined` if no such ancestor exists.
 *
 * @example
 *
 * ```typescript
 * interface Parented {
 *   id: string;
 *   parent?: Parented;
 * }
 * const g = { id: "g" }; // Grandparent
 * const p = { parent: g, id: "p" }; // Parent
 * const c = { parent: p, id: "c" }; // Child
 * const path: Parented[] = [];
 * const ancestor = findAncestor<Parented>([c, path], (n) => n.id === "g");
 * // ancestor === g
 * // path === [p, c]
 * ```
 */
export function findAncestor<T extends { parent?: T }>(
	descendant: T | [descendant: T | undefined, path?: T[]] | undefined,
	predicate: (t: T) => boolean,
): T | undefined;
export function findAncestor<T extends { parent?: T }>(
	descendant: T | [descendant: T | undefined, path?: T[]] | undefined,
	predicate: (t: T) => boolean = (t): boolean => t.parent === undefined,
): T | undefined {
	let d: T | undefined;
	let path: T[] | undefined;
	if (Array.isArray(descendant)) {
		[d, path] = descendant;
	} else {
		d = descendant;
	}
	for (let cur = d; cur !== undefined; cur = cur.parent) {
		if (predicate(cur)) {
			path?.reverse();
			return cur;
		}
		path?.push(cur);
	}

	if (path !== undefined) {
		path.length = 0;
	}
	return undefined;
}

/**
 * Find a common ancestor between two descendants that are linked by parent pointers.
 * @param descendantA - a descendant. If an empty `path` array is included, it will be populated
 * with the chain of commits from the ancestor to `descendantA` (not including the ancestor).
 * @param descendantB - another descendant. If an empty `path` array is included, it will be populated
 * with the chain of commits from the ancestor to `descendantB` (not including the ancestor).
 * @returns the common ancestor of `descendantA` and `descendantB`, or `undefined` if no such ancestor exists.
 *
 * @example
 *
 * ```typescript
 * interface Parented {
 *   parent?: Parented;
 * }
 * const shared = {};
 * const a = { parent: shared };
 * const b1 = { parent: shared };
 * const b2 = { parent: b1 };
 * const pathB: Parented[] = []
 * const ancestor = findCommonAncestor<Parented>(a, [b2, pathB]);
 * // ancestor === shared
 * // pathB === [b1, b2]
 * ```
 */
export function findCommonAncestor<T extends { parent?: T }>(
	descendantA: T | [descendantA: T, path?: T[]] | undefined,
	descendantB: T | [descendantB: T, path?: T[]] | undefined,
): T | undefined {
	let a: T | undefined;
	let b: T | undefined;
	let pathA: T[] | undefined;
	let pathB: T[] | undefined;
	if (Array.isArray(descendantA)) {
		[a, pathA] = descendantA;
		assert(pathA === undefined || pathA.length === 0, 0x578 /* Path A must be empty */);
	} else {
		a = descendantA;
	}
	if (Array.isArray(descendantB)) {
		[b, pathB] = descendantB;
		assert(pathB === undefined || pathB.length === 0, 0x579 /* Path B must be empty */);
	} else {
		b = descendantB;
	}

	if (a === b) {
		return a;
	}

	const reversePaths = (): void => {
		pathA?.reverse();
		pathB?.reverse();
	};

	const visited = new Set();
	while (a !== undefined || b !== undefined) {
		if (a !== undefined) {
			if (visited.has(a)) {
				if (pathB !== undefined) {
					pathB.length = pathB.findIndex((r) => Object.is(r, a));
				}
				reversePaths();
				return a;
			}
			visited.add(a);
			pathA?.push(a);
			a = a.parent;
		}

		if (b !== undefined) {
			if (visited.has(b)) {
				if (pathA !== undefined) {
					pathA.length = pathA.findIndex((r) => Object.is(r, b));
				}
				reversePaths();
				return b;
			}
			visited.add(b);
			pathB?.push(b);
			b = b.parent;
		}
	}

	if (pathA !== undefined) {
		pathA.length = 0;
	}
	if (pathB !== undefined) {
		pathB.length = 0;
	}
	return undefined;
}

export function replaceChange<TChange>(
	commit: GraphCommit<TChange>,
	change: TChange,
): GraphCommit<TChange> {
	const output = { ...commit, change };
	Rollback.set(output, undefined);
	return output;
}

/** Associates rollback data with commits */
namespace Rollback {
	const map = new WeakMap<GraphCommit<unknown>, TaggedChange<unknown, RevisionTag>>();

	export function get<TChange>(
		commit: GraphCommit<TChange>,
	): TaggedChange<TChange, RevisionTag> | undefined {
		return map.get(commit) as TaggedChange<TChange, RevisionTag> | undefined;
	}

	export function set<TChange>(
		commit: GraphCommit<TChange>,
		rollback: TaggedChange<TChange, RevisionTag> | undefined,
	): void {
		if (rollback === undefined) {
			map.delete(commit);
		} else {
			map.set(commit, rollback);
		}
	}
}

/**
 * Checks if one node is an ancestor of another in a parent-linked tree structure.
 * @param ancestor - The potential ancestor node
 * @param descendant - The potential descendant node
 * @param allowEqual - If true, returns true when ancestor === descendant
 * @returns true if ancestor is an ancestor of descendant (or equal if allowEqual is true)
 */
export function isAncestor<TNode extends { readonly parent?: TNode }>(
	ancestor: TNode,
	descendant: TNode,
	allowEqual: boolean,
): boolean {
	if (allowEqual && ancestor === descendant) {
		return true;
	}

	let current = descendant.parent;
	while (current !== undefined) {
		if (current === ancestor) {
			return true;
		}
		current = current.parent;
	}

	return false;
}

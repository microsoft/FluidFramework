/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

// Allow importing from these specific files which are being tested:
import {
	type GraphCommit,
	type RevisionTag,
	findAncestor,
	findCommonAncestor,
	rebaseBranch,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../core/rebase/index.js";
import { type NonEmptyTestChange, TestChange, TestChangeRebaser } from "../testChange.js";
import { mintRevisionTag } from "../utils.js";

function newCommit(
	intention: number | number[],
	parent?: GraphCommit<TestChange>,
): GraphCommit<TestChange> {
	const inputContext2: number[] = [];
	if (parent !== undefined) {
		const path: GraphCommit<TestChange>[] = [];
		const ancestor = findAncestor([parent, path]);
		inputContext2.push(
			...[ancestor, ...path].map((c) => {
				assert(
					typeof c.revision === "number",
					"root revision should not be present on test commit",
				);
				return c.revision;
			}),
		);
	}
	return {
		change: TestChange.mint(inputContext2, intention),
		revision: intention as RevisionTag,
		parent,
	};
}

describe("rebaseBranch", () => {
	function assertChanges(
		commits: Iterable<GraphCommit<TestChange>>,
		...changes: TestChange[]
	): void {
		for (const commit of commits) {
			const change = changes.shift();
			assert(change !== undefined, "Fewer changes than commits");
			assert.deepEqual(commit.change, change);
		}
		assert(changes.length === 0, "Fewer commits than changes");
	}

	function assertOutputContext(change?: TestChange, ...expected: number[]): void {
		const outputContext =
			(change as NonEmptyTestChange | undefined)?.outputContext ??
			fail("Expected output context");

		assert.deepEqual(outputContext, expected);
	}

	// These tests use the following notation to show the commit graph used in each scenario:
	//
	// 1 ─(2)─ 3
	// └─ 4 ─ 5
	//
	// Commit "3" has a parent "2", which has a parent "1". Commit "5" has a parent "4" which has a parent "1".
	// Commit "1" is the common ancestor of the branch with head commit "3" and the branch with head commit "5".
	// Commit "2" is in parentheses and is the target commit of the rebase operation.

	// Disabled because the corresponding assert was too expensive.
	// See comments in `rebaseBranch` for more information.
	it.skip("fails if branches are disjoint", () => {
		// 1 ─ 2
		// 3
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3);

		assert.throws(
			() => rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n3, n2),
			(e: Error) => validateAssertionError(e, "branches must be related"),
		);

		assert.throws(
			() => rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n2, n3, n1),
			(e: Error) => validateAssertionError(e, "target commit is not in target branch"),
		);
	});

	it("does nothing if already rebased onto target", () => {
		// 1
		// └─ 2 ─ 3
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);

		// (1)
		//  └─ 2 ─ 3
		const {
			newSourceHead: n3_1,
			sourceChange,
			commits,
			telemetryProperties,
		} = rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n3, n1);
		assert.equal(n3_1, n3);
		assert.equal(sourceChange, undefined);
		assert.deepEqual(commits.deletedSourceCommits, []);
		assert.deepEqual(commits.targetCommits, []);
		assert.deepEqual(commits.sourceCommits, [n2, n3]);
		assert.equal(telemetryProperties.sourceBranchLength, 2);
		assert.equal(telemetryProperties.rebaseDistance, 0);
		assert.equal(telemetryProperties.countDropped, 0);
	});

	it("can rebase a branch onto the head of another branch", () => {
		// 1 ─ 2 ─ 3
		// └─ 4 ─ 5
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);
		const n4 = newCommit(4, n1);
		const n5 = newCommit(5, n4);

		// 1 ─ 2 ─(3)
		//         └─ 4'─ 5'
		const {
			newSourceHead: n5_1,
			sourceChange,
			commits,
			telemetryProperties,
		} = rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n5, n3);
		const newPath = getPath(n3, n5_1);
		assertChanges(
			newPath,
			{
				inputContext: [1, 2, 3],
				intentions: [4],
				outputContext: [1, 2, 3, 4],
			},
			{
				inputContext: [1, 2, 3, 4],
				intentions: [5],
				outputContext: [1, 2, 3, 4, 5],
			},
		);
		assertOutputContext(sourceChange, 1, 2, 3, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n4, n5]);
		assert.deepEqual(commits.targetCommits, [n2, n3]);
		assert.deepEqual(commits.sourceCommits, newPath);
		assert.equal(telemetryProperties.sourceBranchLength, 2);
		assert.equal(telemetryProperties.rebaseDistance, 2);
		assert.equal(telemetryProperties.countDropped, 0);
	});

	it("can rebase a branch onto the middle of another branch", () => {
		// 1 ─ 2 ─ 3
		// └─ 4 ─ 5
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);
		const n4 = newCommit(4, n1);
		const n5 = newCommit(5, n4);

		// 1 ─(2)─ 3
		//     └─ 4'─ 5'
		const {
			newSourceHead: n5_1,
			sourceChange,
			commits,
			telemetryProperties,
		} = rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n5, n2, n3);
		const newPath = getPath(n2, n5_1);
		assertChanges(
			newPath,
			{
				inputContext: [1, 2],
				intentions: [4],
				outputContext: [1, 2, 4],
			},
			{
				inputContext: [1, 2, 4],
				intentions: [5],
				outputContext: [1, 2, 4, 5],
			},
		);
		assertOutputContext(sourceChange, 1, 2, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n4, n5]);
		assert.deepEqual(commits.targetCommits, [n2]);
		assert.deepEqual(commits.sourceCommits, newPath);
		assert.equal(telemetryProperties.sourceBranchLength, 2);
		assert.equal(telemetryProperties.rebaseDistance, 1);
		assert.equal(telemetryProperties.countDropped, 0);
	});

	it("skips and advances over commits with the same revision tag", () => {
		// 1 ─ 2 ─ 3 ─ 4
		// └─ 2'─ 3'─ 5
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);
		const n4 = newCommit(4, n3);
		const n2_1 = newCommit(2, n1);
		const n3_1 = newCommit(3, n2_1);
		const n5 = newCommit(5, n3_1);

		// 1 ─(2)─ 3 ─ 4
		//         └─ 5'
		const {
			newSourceHead: n5_1,
			sourceChange,
			commits,
			telemetryProperties,
		} = rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n5, n2, n4);
		const newPath = getPath(n3, n5_1);
		assertChanges(newPath, {
			inputContext: [1, 2, 3],
			intentions: [5],
			outputContext: [1, 2, 3, 5],
		});
		assert.equal(sourceChange, undefined);
		assert.deepEqual(commits.deletedSourceCommits, [n2_1, n3_1, n5]);
		assert.deepEqual(commits.targetCommits, [n2, n3]);
		assert.deepEqual(commits.sourceCommits, newPath);
		assert.equal(telemetryProperties.sourceBranchLength, 3);
		assert.equal(telemetryProperties.rebaseDistance, 2);
		assert.equal(telemetryProperties.countDropped, 2);
	});

	it("correctly rebases over branches that share some commits", () => {
		// 1 ─ 2 ─ 3 ─ 4
		// └─ 2'─ 3'─ 5
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);
		const n4 = newCommit(4, n3);
		const n2_1 = newCommit(2, n1);
		const n3_1 = newCommit(3, n2_1);
		const n5 = newCommit(5, n3_1);

		// 1 ─ 2 ─ 3 ─(4)
		//             └─ 5'
		const {
			newSourceHead: n5_1,
			sourceChange,
			commits,
			telemetryProperties,
		} = rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n5, n4);
		const newPath = getPath(n4, n5_1);
		assertChanges(newPath, {
			inputContext: [1, 2, 3, 4],
			intentions: [5],
			outputContext: [1, 2, 3, 4, 5],
		});
		assertOutputContext(sourceChange, 1, 2, 3, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n2_1, n3_1, n5]);
		assert.deepEqual(commits.targetCommits, [n2, n3, n4]);
		assert.deepEqual(commits.sourceCommits, newPath);
		assert.equal(telemetryProperties.sourceBranchLength, 3);
		assert.equal(telemetryProperties.rebaseDistance, 3);
		assert.equal(telemetryProperties.countDropped, 2);
	});

	it("rebases the source branch farther than `newBase` if the source branch's next commits after `newBase` match those on the target branch", () => {
		// 1 ─ 2 ─ 3 ─ 4 ─ 5
		// └─ 3' ─ 4' ─ 6
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);
		const n4 = newCommit(4, n3);
		const n5 = newCommit(5, n4);
		const n3_1 = newCommit(3, n1);
		const n4_1 = newCommit(4, n3_1);
		const n6 = newCommit(6, n4_1);

		// 1 ─(2)─ 3 ─ 4 ─ 5
		//             └─ 6
		const {
			newSourceHead: n6_1,
			sourceChange,
			commits,
			telemetryProperties,
		} = rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n6, n2, n5);
		const newPath = getPath(n2, n6_1);
		assertChanges(
			newPath,
			TestChange.mint([1, 2], 3),
			TestChange.mint([1, 2, 3], 4),
			TestChange.mint([1, 2, 3, 4], 6),
		);
		assertOutputContext(sourceChange, 1, 2, 3, 4, 6);
		assert.deepEqual(commits.deletedSourceCommits, [n3_1, n4_1, n6]);
		assert.deepEqual(commits.targetCommits, [n2, n3, n4]);
		assert.deepEqual(commits.sourceCommits, [n6_1]);
		assert.equal(telemetryProperties.sourceBranchLength, 3);
		assert.equal(telemetryProperties.rebaseDistance, 3);
		assert.equal(telemetryProperties.countDropped, 2);
	});

	it("reports no change for equivalent branches", () => {
		// 1 ─ 2 ─ 3 ─ 4
		// └─ 2'─ 3'
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);
		const n4 = newCommit(4, n3);
		const n2_1 = newCommit(2, n1);
		const n3_1 = newCommit(3, n2_1);

		// 1 ─ 2 ─(3)─ 4
		//         └─
		const {
			newSourceHead: n3_2,
			sourceChange,
			commits,
			telemetryProperties,
		} = rebaseBranch(mintRevisionTag, new TestChangeRebaser(), n3_1, n3, n4);
		assert.equal(n3_2, n3);
		assert.equal(sourceChange, undefined);
		assert.deepEqual(commits.deletedSourceCommits, [n2_1, n3_1]);
		assert.deepEqual(commits.targetCommits, [n2, n3]);
		assert.deepEqual(commits.sourceCommits, []);
		assert.equal(telemetryProperties.sourceBranchLength, 2);
		assert.equal(telemetryProperties.rebaseDistance, 2);
		assert.equal(telemetryProperties.countDropped, 2);
	});
});

/**
 * @returns the path from the base of a branch to its head
 */
function getPath<TChange>(
	fromAncestor: GraphCommit<TChange> | undefined,
	toHead: GraphCommit<TChange>,
): GraphCommit<TChange>[] {
	const path: GraphCommit<TChange>[] = [];
	const ancestor = findCommonAncestor(fromAncestor, [toHead, path]);
	assert.equal(ancestor, fromAncestor);
	return path;
}

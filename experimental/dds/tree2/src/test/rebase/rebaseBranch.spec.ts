/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

// Allow importing from these specific files which are being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { GraphCommit, RevisionTag, findCommonAncestor, rebaseBranch } from "../../core/rebase";
import { NonEmptyTestChange, TestChange, TestChangeRebaser } from "../testChange";

function node(
	inputContext: readonly number[],
	intention: number | number[],
	parent?: GraphCommit<TestChange>,
): GraphCommit<TestChange> {
	return {
		change: TestChange.mint(inputContext, intention),
		revision: intention.toString() as RevisionTag,
		sessionId: "TestSession",
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

	function assertOutputContext(change: TestChange, ...expected: number[]): void {
		const outputContext =
			(change as NonEmptyTestChange).outputContext ?? fail("Expected output context");

		assert.deepEqual(outputContext, expected);
	}

	it("can rebase a branch onto the head of another branch", () => {
		// 1 ─ 2 ─ 3
		// └─ 4 ─ 5
		const n1 = node([], 1);
		const n2 = node([1], 2, n1);
		const n3 = node([1, 2], 3, n2);
		const n4 = node([1], 4, n1);
		const n5 = node([1, 4], 5, n4);

		// 1 ─ 2 ─(3)
		//         └─ 4' ─ 5'
		const [n5_1, change, commits] = rebaseBranch(new TestChangeRebaser(), n5, n3);
		const newPath = getPath(n3, n5_1);
		assertChanges(
			newPath,
			{ inputContext: [1, 2, 3], intentions: [4], outputContext: [1, 2, 3, 4] },
			{ inputContext: [1, 2, 3, 4], intentions: [5], outputContext: [1, 2, 3, 4, 5] },
		);
		assertOutputContext(change, 1, 2, 3, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n4, n5]);
		assert.deepEqual(commits.newSourceCommits, [n2, n3, ...newPath]);
	});

	it("can rebase a branch onto the middle of another branch", () => {
		// 1 ─ 2 ─ 3
		// └─ 4 ─ 5
		const n1 = node([], 1);
		const n2 = node([1], 2, n1);
		const n3 = node([1, 2], 3, n2);
		const n4 = node([1], 4, n1);
		const n5 = node([1, 4], 5, n4);

		// 1 ─(2)─ 3
		//     └─ 4' ─ 5'
		const [n5_1, change, commits] = rebaseBranch(new TestChangeRebaser(), n5, n2, n3);
		const newPath = getPath(n2, n5_1);
		assertChanges(
			newPath,
			{ inputContext: [1, 2], intentions: [4], outputContext: [1, 2, 4] },
			{ inputContext: [1, 2, 4], intentions: [5], outputContext: [1, 2, 4, 5] },
		);
		assertOutputContext(change, 1, 2, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n4, n5]);
		assert.deepEqual(commits.newSourceCommits, [n2, ...newPath]);
		assert.equal(commits.newBase, n2);
	});

	it("skips commits with the same revision tag", () => {
		// 1 ─ 2 ─ 3 - 4
		// └─ 2'─ 3'- 5
		const n1 = node([], 1);
		const n2 = node([1], 2, n1);
		const n3 = node([1, 2], 3, n2);
		const n4 = node([1, 2, 3], 4, n3);
		const n2_1 = node([1], 2, n1);
		const n3_1 = node([1, 2], 3, n2_1);
		const n5 = node([1, 2, 3], 5, n3_1);

		// 1 ─(2)─ 3 - 4
		//         └─ 5'
		const [n5_1, change, commits] = rebaseBranch(new TestChangeRebaser(), n5, n2, n4);
		const newPath = getPath(n3, n5_1);
		assertChanges(newPath, {
			inputContext: [1, 2, 3],
			intentions: [5],
			outputContext: [1, 2, 3, 5],
		});
		assertOutputContext(change, 1, 2, 3, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n2_1, n3_1, n5]);
		assert.deepEqual(commits.newSourceCommits, [n2, n3, ...newPath]);
		assert.equal(commits.newBase, n3);
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

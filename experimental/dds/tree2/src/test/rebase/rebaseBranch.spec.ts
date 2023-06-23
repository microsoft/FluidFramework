/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
// Allow importing from these specific files which are being tested:
import {
	GraphCommit,
	RevisionTag,
	findAncestor,
	findCommonAncestor,
	rebaseBranch,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../core/rebase";
import { NonEmptyTestChange, TestChange, TestChangeRebaser } from "../testChange";
import { MockRepairDataStoreProvider } from "../utils";

function newCommit(
	intention: number | number[],
	parent?: GraphCommit<TestChange>,
): GraphCommit<TestChange> {
	const inputContext2: number[] = [];
	if (parent !== undefined) {
		const path: GraphCommit<TestChange>[] = [];
		const ancestor = findAncestor([parent, path]);
		inputContext2.push(...[ancestor, ...path].map((c) => Number.parseInt(c.revision, 10)));
	}
	return {
		change: TestChange.mint(inputContext2, intention),
		revision: intention.toString() as RevisionTag,
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

	it("fails if branches are disjoint", () => {
		// 1 ─ 2
		// 3
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3);

		assert.throws(
			() => rebaseBranch(new TestChangeRebaser(), new MockRepairDataStoreProvider(), n3, n2),
			(e) => validateAssertionError(e, "branches must be related"),
		);

		assert.throws(
			() =>
				rebaseBranch(
					new TestChangeRebaser(),
					new MockRepairDataStoreProvider(),
					n2,
					n3,
					n1,
				),
			(e) => validateAssertionError(e, "target commit is not in target branch"),
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
		const [n3_1, change, commits] = rebaseBranch(
			new TestChangeRebaser(),
			new MockRepairDataStoreProvider(),
			n3,
			n1,
		);
		assert.equal(n3_1, n3);
		assert.equal(change, undefined);
		assert.deepEqual(commits.deletedSourceCommits, []);
		assert.deepEqual(commits.targetCommits, []);
		assert.deepEqual(commits.sourceCommits, [n2, n3]);
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
		const [n5_1, change, commits] = rebaseBranch(
			new TestChangeRebaser(),
			new MockRepairDataStoreProvider(),
			n5,
			n3,
		);
		const newPath = getPath(n3, n5_1);
		assertChanges(
			newPath,
			{ inputContext: [1, 2, 3], intentions: [4], outputContext: [1, 2, 3, 4] },
			{ inputContext: [1, 2, 3, 4], intentions: [5], outputContext: [1, 2, 3, 4, 5] },
		);
		assertOutputContext(change, 1, 2, 3, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n4, n5]);
		assert.deepEqual(commits.targetCommits, [n2, n3]);
		assert.deepEqual(commits.sourceCommits, newPath);
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
		const [n5_1, change, commits] = rebaseBranch(
			new TestChangeRebaser(),
			new MockRepairDataStoreProvider(),
			n5,
			n2,
			n3,
		);
		const newPath = getPath(n2, n5_1);
		assertChanges(
			newPath,
			{ inputContext: [1, 2], intentions: [4], outputContext: [1, 2, 4] },
			{ inputContext: [1, 2, 4], intentions: [5], outputContext: [1, 2, 4, 5] },
		);
		assertOutputContext(change, 1, 2, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n4, n5]);
		assert.deepEqual(commits.targetCommits, [n2]);
		assert.deepEqual(commits.sourceCommits, newPath);
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
		const [n5_1, change, commits] = rebaseBranch(
			new TestChangeRebaser(),
			new MockRepairDataStoreProvider(),
			n5,
			n2,
			n4,
		);
		const newPath = getPath(n3, n5_1);
		assertChanges(newPath, {
			inputContext: [1, 2, 3],
			intentions: [5],
			outputContext: [1, 2, 3, 5],
		});
		assert.equal(change, undefined);
		assert.deepEqual(commits.deletedSourceCommits, [n2_1, n3_1, n5]);
		assert.deepEqual(commits.targetCommits, [n2, n3]);
		assert.deepEqual(commits.sourceCommits, newPath);
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
		const [n5_1, change, commits] = rebaseBranch(
			new TestChangeRebaser(),
			new MockRepairDataStoreProvider(),
			n5,
			n4,
		);
		const newPath = getPath(n4, n5_1);
		assertChanges(newPath, {
			inputContext: [1, 2, 3, 4],
			intentions: [5],
			outputContext: [1, 2, 3, 4, 5],
		});
		assertOutputContext(change, 1, 2, 3, 4, 5);
		assert.deepEqual(commits.deletedSourceCommits, [n2_1, n3_1, n5]);
		assert.deepEqual(commits.targetCommits, [n2, n3, n4]);
		assert.deepEqual(commits.sourceCommits, newPath);
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
		const [n3_2, change, commits] = rebaseBranch(
			new TestChangeRebaser(),
			new MockRepairDataStoreProvider(),
			n3_1,
			n3,
			n4,
		);
		assert.equal(n3_2, n3);
		assert.equal(change, undefined);
		assert.deepEqual(commits.deletedSourceCommits, [n2_1, n3_1]);
		assert.deepEqual(commits.targetCommits, [n2, n3]);
		assert.deepEqual(commits.sourceCommits, []);
	});

	it("generates and stores repair data for rebased changes", () => {
		// 1 ─ 2 ─ 3 ─ 4
		// └─ 2'─ 3'─ 5
		const n1 = newCommit(1);
		const n2 = newCommit(2, n1);
		const n3 = newCommit(3, n2);
		const n4 = newCommit(4, n3);
		const repair4 = n4.repairData;
		const n2_1 = newCommit(2, n1);
		const n3_1 = newCommit(3, n2_1);
		const n5 = newCommit(5, n3_1);

		// 1 ─ 2 ─ 3 ─(4)
		//             └─ 5'
		const [n5_1, change, commits] = rebaseBranch(
			new TestChangeRebaser(),
			new MockRepairDataStoreProvider(),
			n5,
			n4,
		);

		// Check that 5' has newly generated repair data from 5
		// and the 4 has the same repair data as before
		assert.notEqual(n5.repairData, n5_1.repairData);
		assert.equal(n5_1.parent?.repairData, repair4);
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

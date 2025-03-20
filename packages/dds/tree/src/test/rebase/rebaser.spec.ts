/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeRebaser, RevisionTag } from "../../core/index.js";

// Allow importing from these specific files which are being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { type GraphCommit, rebaseBranch } from "../../core/rebase/index.js";
import { fail } from "../../util/index.js";
import { mintRevisionTag } from "../utils.js";

/** Given a number in the range [0, 15], turn it into a deterministic and human-rememberable v4 UUID */
function makeRevisionTag(tag: number): RevisionTag {
	if (tag > 15) {
		fail("Tags bigger than 15 are not supported");
	}

	return tag as RevisionTag;
}

const dummyChange = {};
type DummyCommit = GraphCommit<typeof dummyChange>;

/** A change rebaser which does nothing at all and always returns the same object */
export class DummyChangeRebaser implements ChangeRebaser<typeof dummyChange> {
	public compose(): typeof dummyChange {
		return {};
	}

	public invert(): typeof dummyChange {
		return {};
	}

	public rebase(): typeof dummyChange {
		return {};
	}

	public changeRevision(): typeof dummyChange {
		return {};
	}
}

describe("rebaser", () => {
	/**
	 * This suite of tests ensures that the `Rebaser` class properly structures its output branches.
	 * It does not test the rebasing of the changes within the branches, only that the edges in the
	 * commit graph are accurate.
	 */
	describe("correctly parents", () => {
		/**
		 * This is a utility class for the tests below which makes it easy to create branches
		 * and keep track of the generated commits, as well as assert the parentage of a given
		 * commit.
		 */
		class BranchTester {
			[tag: number]: DummyCommit | undefined;

			public readonly main: DummyCommit;
			public readonly branch: DummyCommit;

			public constructor(
				main: [number, ...number[]],
				branch: [baseInMain: number, ...branch: number[]],
			) {
				let cur: DummyCommit | undefined;
				for (const revision of main) {
					cur = {
						revision: makeRevisionTag(revision),
						change: {},
						parent: cur,
					};
					this[revision] = cur;
				}
				this.main = cur ?? fail("Expected main to have at least one commit");
				const [baseInMain] = branch;
				cur = this[baseInMain] ?? fail("branch base must be in main");
				for (const revision of branch.slice(1)) {
					cur = {
						revision: makeRevisionTag(revision),
						change: {},
						parent: cur,
					};
				}

				this.branch = cur ?? fail("Expected branch to have at least one commit");
			}

			public assertParentage(head: DummyCommit, ...revisions: number[]): void {
				const branch: RevisionTag[] = [];
				for (let cur: DummyCommit | undefined = head; cur !== undefined; cur = cur.parent) {
					branch.unshift(cur.revision);
				}

				assert.deepEqual(branch, revisions.map(makeRevisionTag));
			}
		}

		function formatBranch<T>(branch: Iterable<T>): string {
			let s = "";
			for (const b of branch) {
				s = `${s}─(${b})`;
			}

			return s.slice(1);
		}

		/**
		 * Test a branch properly rebases over another branch. All parameters are numbers which represent the tag of each commit.
		 * @param main - the primary branch
		 * @param branch - the branch that branches off of `main`
		 * @param expected - what `branch` is expected to look like after being rebased over `main`
		 * @param baseInMain - the commit in `main` to rebase up to. Defaults to the last commit in `main`
		 */
		function itRebase(
			main: [number, ...number[]],
			branch: [baseInMain: number, ...branch: number[]],
			expected: [baseInMain: number, ...branch: number[]],
			baseInMain?: number,
		): void {
			const title = `${formatBranch(main)} ⇘ ${formatBranch(branch)}${
				baseInMain !== undefined ? `  (base: ${baseInMain})` : ""
			}`;

			it(title, () => {
				const tester = new BranchTester(main, branch);
				const base =
					baseInMain !== undefined
						? (tester[baseInMain] ?? fail("Expected baseInMain to be in main"))
						: tester.main;

				const { newSourceHead } = rebaseBranch(
					mintRevisionTag,
					new DummyChangeRebaser(),
					tester.branch,
					base,
					tester.main,
				);
				// The `expected` parameter starts at the base of the branch. Prepend the rest of the main
				// branch to it so that it can be fully compared against the `BranchTester`'s `main`.
				const expectedBaseIndex = main.indexOf(expected[0]);
				assert.notEqual(expectedBaseIndex, -1, "Expected expected base to be in main");
				const mainBeforeExpected = main.slice(0, expectedBaseIndex);
				tester.assertParentage(newSourceHead, ...[...mainBeforeExpected, ...expected]);
			});
		}

		// 0
		itRebase([0], [0], [0]);

		// 0 ─ 1
		itRebase([0, 1], [0], [1]);

		// 0
		// └─ 1
		itRebase([0], [0, 1], [0, 1]);

		// 0 ─ 1
		// └─ 2 ─ 3
		itRebase([0, 1], [0, 2, 3], [1, 2, 3]);

		// 0 ─ 1 ─ 2
		// └─ 3
		itRebase([0, 1, 2], [0, 3], [2, 3]);

		// 0 ─ 1 ─ 2
		//     └─ 3
		itRebase([0, 1, 2], [1, 3], [2, 3]);

		// With base set:

		// (0)─ 1
		//  └─ 2 ─ 3
		itRebase([0, 1], [0, 2, 3], [0, 2, 3], 0);

		// 0 ─(1)─ 2
		// └─ 3
		itRebase([0, 1, 2], [0, 3], [1, 3], 1);

		// 0 ─(1)─ 2
		//      └─ 3
		itRebase([0, 1, 2], [1, 3], [1, 3], 1);

		// With shared ids:

		// 0 ─ 1
		// └─ 1
		itRebase([0, 1], [0, 1], [1]);

		// 0 ─ 1 ─ 2
		// └─ 1 ─ 3
		itRebase([0, 1, 2], [0, 1, 3], [2, 3]);

		// 0 ─ 1 ─ 2
		//     └─ 2
		itRebase([0, 1, 2], [1, 2], [2]);

		// Base set and shared ids:

		// 0 ─(1)─ 2
		itRebase([0, 1, 2], [0], [1], 1);

		// (0)─ 1
		//  └─ 1
		itRebase([0, 1], [0, 1], [1], 0);

		// (0)─ 1 ─ 2
		//  └─ 1 ─ 3
		itRebase([0, 1, 2], [0, 1, 3], [1, 3], 0);

		// 0 ─(1)─ 2
		// └─ 1 ─ 3
		itRebase([0, 1, 2], [0, 1, 3], [1, 3], 1);

		// 0)─ 1 ─ 2
		//     └─ 2
		itRebase([0, 1, 2], [0, 1, 2], [2], 0);

		// 0 ─(1)─ 2
		//     └─ 2
		itRebase([0, 1, 2], [1, 2], [2], 1);

		// 0 ─ 1 ─(2)─ 3 ─ 4 ─ 5
		//     └─ 2 ─ 4 ─ 5
		itRebase([0, 1, 2, 3, 4, 5], [1, 2, 4, 5], [2, 4, 5], 2);

		// 0 ─ 1 ─ 2 ─(3)─ 4 ─ 5
		//     └─ 2 ─ 4 ─ 5
		itRebase([0, 1, 2, 3, 4, 5], [1, 2, 4, 5], [5], 3);
	});
});

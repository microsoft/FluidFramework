/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type GraphCommit,
	type RevisionTag,
	findAncestor,
	findCommonAncestor,
	rootFieldKey,
} from "../../core/index.js";
import {
	DefaultChangeFamily,
	type DefaultChangeset,
	type DefaultEditBuilder,
	cursorForJsonableTreeNode,
} from "../../feature-libraries/index.js";
import {
	SharedTreeBranch,
	type SharedTreeBranchChange,
	onForkTransitive,
} from "../../shared-tree-core/index.js";
import { brand, fail } from "../../util/index.js";
import { failCodecFamily, mintRevisionTag } from "../utils.js";

const defaultChangeFamily = new DefaultChangeFamily(failCodecFamily);

type DefaultBranch = SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>;

describe("Branches", () => {
	/** The tag used for the "origin commit" (the commit that all other commits share as a common ancestor) */
	const nullRevisionTag = mintRevisionTag();

	it("have a consistent history as they apply changes", () => {
		// Create a new branch
		const branch = create();
		// Apply two changes to it
		const tag1 = change(branch);
		const tag2 = change(branch);
		// Ensure that the commits are in the correct order with the correct tags
		assertHistory(branch, tag1, tag2);
	});

	it("that are forks are isolated from their parent's changes", () => {
		// Create a parent branch and a fork
		const parent = create();
		const child = parent.fork();
		const childHead = child.getHead();
		// Apply a couple of changes to the parent
		change(parent);
		change(parent);
		// Ensure that the child has not changed
		assert.equal(child.getHead(), childHead);
	});

	it("that create forks are isolated from their child's changes", () => {
		// Create a parent branch and a fork
		const parent = create();
		const parentHead = parent.getHead();
		const child = parent.fork();
		// Apply a couple of changes to the fork
		change(child);
		change(child);
		// Ensure that the parent has not changed
		assert.equal(parent.getHead(), parentHead);
	});

	it("rebase changes from a child onto a parent", () => {
		// Create a parent branch and a child fork
		const parent = create();
		const child = parent.fork();
		// Apply a couple of changes to the parent
		const tag1 = change(parent);
		const tag2 = change(parent);
		// Rebase the child onto the parent
		child.rebaseOnto(parent);
		assertBased(child, parent);
		// Ensure that the changes are now present on the child
		assertHistory(child, tag1, tag2);
	});

	it("rebase changes from a parent onto a child", () => {
		// Create a parent branch and a child fork
		const parent = create();
		const child = parent.fork();
		// Apply a couple of changes to the child
		const tag1 = change(child);
		const tag2 = change(child);
		// Rebase the parent onto the child
		parent.rebaseOnto(child);
		assertBased(parent, child);
		// Ensure that the changes are now present on the parent
		assertHistory(parent, tag1, tag2);
	});

	it("rebase changes up to a certain commit", () => {
		// Create a parent branch and a child fork
		const parent = create();
		const child = parent.fork();
		// Apply a couple of changes to the parent
		const tag1 = change(parent);
		change(parent);
		// Rebase the child onto the parent up to the first new commit
		const parentCommit1 =
			findAncestor(parent.getHead(), (c) => c.revision === tag1) ??
			fail("Expected to find commit");

		child.rebaseOnto(parent, parentCommit1);
		// Ensure that the changes are now present on the child
		assertHistory(child, tag1);
	});

	it("merge changes from a child into a parent", () => {
		// Create a parent branch and a child fork
		const parent = create();
		const child = parent.fork();
		// Apply a couple of changes to the fork
		const tag1 = change(child);
		const tag2 = change(child);
		// Merge the changes into the parent
		parent.merge(child);
		// Ensure that the changes are now present on the parent
		assertHistory(parent, tag1, tag2);
	});

	it("merge changes from a parent into a child", () => {
		// Create a parent branch and a child fork
		const parent = create();
		const child = parent.fork();
		// Apply a couple of changes to the parent
		const tag1 = change(parent);
		const tag2 = change(parent);
		// Merge the changes into the child
		child.merge(parent);
		// Ensure that the changes are now present on the child
		assertHistory(child, tag1, tag2);
	});

	it("correctly merge after being merged", () => {
		// Create a parent branch and a child fork
		const parent = create();
		const child = parent.fork();
		// Apply a change to the parent
		const tagParent = change(parent);
		// Apply a change to the child
		const tagChild = change(child);
		// Merge the child into the parent, and then apply a new change to the parent
		parent.merge(child);
		const tagParent2 = change(parent);
		assertHistory(parent, tagParent, tagChild, tagParent2);
		// Merge the parent into the child. `tagChild` is on both branches, but should be deduplicated.
		child.merge(parent);
		assertHistory(child, tagChild, tagParent, tagParent2);
	});

	it("correctly rebase after being merged", () => {
		// Create a parent branch and a child fork
		const parent = create();
		const child = parent.fork();
		// Apply a change to the parent
		const tagParent = change(parent);
		// Apply a change to the child
		const tagChild = change(child);
		// Merge the child into the parent, and then apply a new change to the parent
		parent.merge(child);
		const tagParent2 = change(parent);
		assertHistory(parent, tagParent, tagChild, tagParent2);
		// Apply a change to the child, then rebase the child onto the parent. The child should now be based on the parent's latest commit.
		const tagChild2 = change(child);
		child.rebaseOnto(parent);
		assertBased(child, parent);
		assertHistory(child, tagParent, tagChild, tagParent2, tagChild2);
	});

	it("emit a change event after each change", () => {
		// Create a branch and count the change events emitted
		let changeEventCount = 0;
		const branch = create(({ type }) => {
			if (type === "append") {
				changeEventCount += 1;
			}
		});
		assert.equal(changeEventCount, 0);
		// Ensure that the change event is emitted once for each change applied
		change(branch);
		assert.equal(changeEventCount, 2);
		change(branch);
		assert.equal(changeEventCount, 4);
	});

	it("emit a change event after rebasing", () => {
		// Create a parent and child branch, and count the change events emitted by the parent
		let changeEventCount = 0;
		const parent = create(({ type }) => {
			if (type === "rebase") {
				changeEventCount += 1;
			}
		});
		const child = parent.fork();
		// Apply changes to both branches
		change(parent);
		change(child);
		assert.equal(changeEventCount, 0);
		// Rebase the parent onto the child and ensure another change event is emitted
		parent.rebaseOnto(child);
		assert.equal(changeEventCount, 2);
	});

	it("do not emit a change event after a rebase with no effect", () => {
		// Create a parent and child branch, and count the change events emitted by the parent
		let changeEventCount = 0;
		const parent = create(({ type }) => {
			if (type === "rebase") {
				changeEventCount += 1;
			}
		});
		const child = parent.fork();
		// Apply a change to the parent
		change(parent);
		assert.equal(changeEventCount, 0);
		// Rebase the parent onto the child and ensure no change is emitted since the child has no new commits
		parent.rebaseOnto(child);
		assert.equal(changeEventCount, 0);
	});

	it("emit a change event after merging", () => {
		// Create a parent and child branch, and count the change events emitted by the parent
		let changeEventCount = 0;
		const parent = create(({ type }) => {
			if (type === "append") {
				changeEventCount += 1;
			}
		});
		const child = parent.fork();
		// Apply changes to both branches
		change(parent);
		change(child);
		assert.equal(changeEventCount, 2);
		// Merge the child into the parent and ensure another change event is emitted
		parent.merge(child);
		assert.equal(changeEventCount, 4);
	});

	it("do not emit a change event after a merge with no effect", () => {
		// Create a parent and child branch, and count the change events emitted by the parent
		let changeEventCount = 0;
		const parent = create(({ type }) => {
			if (type === "append") {
				changeEventCount += 1;
			}
		});
		const child = parent.fork();
		// Apply a change to the parent
		change(parent);
		assert.equal(changeEventCount, 2);
		// Merge the child into the parent and ensure no change is emitted since the child has no new commits
		parent.merge(child);
		assert.equal(changeEventCount, 2);
	});

	it("emit a fork event after forking", () => {
		let fork: DefaultBranch | undefined;
		const branch = create();
		branch.events.on("fork", (f) => (fork = f));
		// The fork event should return the new branch, just as the fork method does
		assert.equal(branch.fork(), fork);
		assert.equal(branch.fork(), fork);
	});

	it("emit a dispose event after disposing", () => {
		const branch = create();
		let disposed = false;
		branch.events.on("dispose", () => (disposed = true));
		branch.dispose();
		assert.equal(disposed, true);
	});

	it("can be read after disposal", () => {
		const branch = create();
		branch.dispose();
		// Getting the head is valid after disposal
		branch.getHead();
	});

	it("cannot be mutated after disposal", () => {
		const branch = create();
		const fork = branch.fork();
		branch.dispose();

		// These methods are not valid to call after disposal
		assertDisposed(() => branch.fork());
		assertDisposed(() => branch.rebaseOnto(fork));
		assertDisposed(() => branch.merge(branch.fork()));
		assertDisposed(() => fork.merge(branch));
	});

	it("can remove commits", () => {
		const branch = create();
		const originalHead = branch.getHead();
		const tag1 = change(branch);
		const tag2 = change(branch);
		assertHistory(branch, tag1, tag2);
		branch.removeAfter(originalHead);
		assert.equal(branch.getHead(), originalHead);
	});

	it("emit correct change events after a remove", () => {
		let removeEventCount = 0;
		const branch = create(({ type }) => {
			if (type === "remove") {
				removeEventCount += 1;
			}
		});
		const originalHead = branch.getHead();
		change(branch);
		change(branch);
		assert.equal(removeEventCount, 0);
		branch.removeAfter(originalHead);
		assert.equal(removeEventCount, 2);
	});

	describe("transitive fork event", () => {
		/** Creates forks at various "depths" and returns the number of forks created */
		function forkTransitive<T extends { fork(): T }>(forkable: T): number {
			forkable.fork();
			const fork = forkable.fork();
			fork.fork();
			fork.fork().fork();
			return 5;
		}

		it("registers listener on transitive forks", () => {
			const branch = create();
			const forks = new Set<DefaultBranch>();
			onForkTransitive(branch, (fork) => forks.add(fork));
			const expected = forkTransitive(branch);
			assert.equal(forks.size, expected);
		});

		it("deregisters all listeners", () => {
			const branch = create();
			let forkCount = 0;
			const deregister = onForkTransitive(branch, () => (forkCount += 1));
			deregister();
			forkTransitive(branch);
			assert.equal(forkCount, 0);
		});

		it("registers listener on forks created inside of the listener", () => {
			const branch = create();
			let forkCount = 0;
			onForkTransitive(branch, (f) => {
				if (forkCount++ === 0) {
					f.fork();
				}
			});
			branch.fork();
			assert.equal(forkCount, 2);
		});
	});

	/** Creates a new root branch */
	function create(
		onChange?: (change: SharedTreeBranchChange<DefaultChangeset>) => void,
	): DefaultBranch {
		const initCommit: GraphCommit<DefaultChangeset> = {
			change: defaultChangeFamily.rebaser.compose([]),
			revision: nullRevisionTag,
		};

		const branch = new SharedTreeBranch(initCommit, defaultChangeFamily, mintRevisionTag);
		let head = branch.getHead();
		branch.events.on("beforeChange", (c) => {
			// Check that the branch head never changes in the "before" event; it should only change after the "after" event.
			assert.equal(branch.getHead(), head);
			onChange?.(c);
		});
		branch.events.on("afterChange", (c) => {
			head = branch.getHead();
			onChange?.(c);
		});

		return branch;
	}

	let changeValue = 0;
	beforeEach(() => {
		changeValue = 0;
	});

	/** Apply an arbitrary but unique change to the given branch and return the tag for the new commit */
	function change(branch: DefaultBranch): RevisionTag {
		const cursor = cursorForJsonableTreeNode({ type: brand("TestValue"), value: changeValue });
		branch.editor.valueField({ parent: undefined, field: rootFieldKey }).set(cursor);
		return branch.getHead().revision;
	}

	/** Assert that the given branch is comprised of commits with exactly the given tags, in order from oldest to newest */
	function assertHistory(branch: DefaultBranch, ...tags: RevisionTag[]): void {
		const commits: GraphCommit<DefaultChangeset>[] = [];
		const ancestor = findAncestor(
			[branch.getHead(), commits],
			(c) => c.revision === nullRevisionTag,
		);
		assert.equal(ancestor?.revision, nullRevisionTag);

		assert.deepEqual(
			commits.map((c) => c.revision),
			tags,
		);
	}

	/** Assert that `branch` branches off of `on` from `on`'s head */
	function assertBased(branch: DefaultBranch, on: DefaultBranch): void {
		const ancestor = findCommonAncestor(branch.getHead(), on.getHead());
		assert.equal(ancestor, on.getHead());
	}

	function assertDisposed(fn: () => void): void {
		assert.throws(fn, (e: Error) => validateAssertionError(e, "Branch is disposed"));
	}

	function assertNotDisposed(fn: () => void): void {
		assert.doesNotThrow(fn, (e: Error) => validateAssertionError(e, /\*/));
	}
});

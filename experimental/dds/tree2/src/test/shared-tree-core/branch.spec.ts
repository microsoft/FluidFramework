/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { SharedTreeBranch, SharedTreeBranchChange } from "../../shared-tree-core";
import {
	GraphCommit,
	RevisionTag,
	UndoRedoManager,
	assertIsRevisionTag,
	findAncestor,
	findCommonAncestor,
	rootFieldKeySymbol,
} from "../../core";
import {
	DefaultChangeset,
	DefaultEditBuilder,
	DefaultChangeFamily,
	singleTextCursor,
} from "../../feature-libraries";
import { brand } from "../../util";
import { MockRepairDataStoreProvider } from "../utils";
import { noopValidator } from "../../codec";

const defaultChangeFamily = new DefaultChangeFamily({ jsonValidator: noopValidator });

type DefaultBranch = SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>;

describe("Branches", () => {
	/** The tag used for the "origin commit" (the commit that all other commits share as a common ancestor) */
	const nullRevisionTag = assertIsRevisionTag("00000000-0000-4000-8000-000000000000");

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
		assert.equal(changeEventCount, 1);
		change(branch);
		assert.equal(changeEventCount, 2);
	});

	it("emit a change event after rebasing", () => {
		// Create a parent and child branch, and count the change events emitted by the parent
		let changeEventCount = 0;
		const parent = create(({ type }) => {
			if (type === "replace") {
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
		assert.equal(changeEventCount, 1);
	});

	it("do not emit a change event after a rebase with no effect", () => {
		// Create a parent and child branch, and count the change events emitted by the parent
		let changeEventCount = 0;
		const parent = create(({ type }) => {
			if (type === "replace") {
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
		assert.equal(changeEventCount, 1);
		// Merge the child into the parent and ensure another change event is emitted
		parent.merge(child);
		assert.equal(changeEventCount, 2);
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
		assert.equal(changeEventCount, 1);
		// Merge the child into the parent and ensure no change is emitted since the child has no new commits
		parent.merge(child);
		assert.equal(changeEventCount, 1);
	});

	it("emit correct change events during and after committing a transaction", () => {
		// Create a branch and count the change events emitted
		let changeEventCount = 0;
		let replaceEventCount = 0;
		const branch = create(({ type }) => {
			if (type === "append") {
				changeEventCount += 1;
			} else if (type === "replace") {
				replaceEventCount += 1;
			}
		});
		// Begin a transaction
		branch.startTransaction();
		// Ensure that the correct change is emitted when applying changes in a transaction
		change(branch);
		assert.equal(changeEventCount, 1);
		change(branch);
		assert.equal(changeEventCount, 2);
		assert.equal(replaceEventCount, 0);
		// Commit the transaction. No change event should be emitted since the commits, though squashed, are still equivalent
		branch.commitTransaction();
		assert.equal(changeEventCount, 2);
		assert.equal(replaceEventCount, 1);
	});

	it("do not emit a change event after committing an empty transaction", () => {
		// Create a branch and count the change events emitted
		let changeEventCount = 0;
		const branch = create(() => {
			changeEventCount += 1;
		});
		// Start and immediately abort a transaction
		branch.startTransaction();
		branch.commitTransaction();
		assert.equal(changeEventCount, 0);
	});

	it("emit a change event after aborting a transaction", () => {
		// Create a branch and count the change events emitted
		let changeEventCount = 0;
		const branch = create(({ type }) => {
			if (type === "remove") {
				changeEventCount += 1;
			}
		});
		// Begin a transaction
		branch.startTransaction();
		// Apply a couple of changes to the branch
		change(branch);
		change(branch);
		// Ensure the the correct number of change events have been emitted so far
		assert.equal(changeEventCount, 0);
		// Abort the transaction. A new change event should be emitted since the state rolls back to before the transaction
		branch.abortTransaction();
		assert.equal(changeEventCount, 1);
	});

	it("do not emit a change event after aborting an empty transaction", () => {
		// Create a branch and count the change events emitted
		let changeEventCount = 0;
		const branch = create(({ type }) => {
			if (type === "remove") {
				changeEventCount += 1;
			}
		});
		// Start and immediately abort a transaction
		branch.startTransaction();
		branch.abortTransaction();
		assert.equal(changeEventCount, 0);
	});

	it("emit a fork event after forking", () => {
		let fork: DefaultBranch | undefined;
		const branch = create();
		branch.on("fork", (f) => (fork = f));
		// The fork event should return the new branch, just as the fork method does
		assert.equal(branch.fork(), fork);
		assert.equal(branch.fork(), fork);
	});

	it("emit a dispose event after disposing", () => {
		const branch = create();
		let disposed = false;
		branch.on("dispose", () => (disposed = true));
		branch.dispose();
		assert.equal(disposed, true);
	});

	it("can be read after disposal", () => {
		const branch = create();
		branch.dispose();
		// These methods are valid to call after disposal
		branch.getHead();
		branch.isTransacting();
	});

	it("cannot be mutated after disposal", () => {
		const branch = create();
		branch.dispose();

		function assertDisposed(fn: () => void): void {
			assert.throws(fn, (e) => validateAssertionError(e, "Branch is disposed"));
		}

		// These methods are not valid to call after disposal
		assertDisposed(() => branch.fork());
		assertDisposed(() => branch.rebaseOnto(branch));
		assertDisposed(() => branch.merge(branch.fork()));
		assertDisposed(() => branch.editor.apply(branch.changeFamily.rebaser.compose([])));
		assertDisposed(() => branch.startTransaction());
		assertDisposed(() => branch.commitTransaction());
		assertDisposed(() => branch.abortTransaction());
		assertDisposed(() => branch.abortTransaction());
		assertDisposed(() => branch.dispose());
	});

	it("correctly report whether they are in the middle of a transaction", () => {
		// Create a branch and test `isTransacting()` during two transactions, one nested within the other
		const branch = create();
		assert.equal(branch.isTransacting(), false);
		branch.startTransaction();
		assert.equal(branch.isTransacting(), true);
		branch.startTransaction();
		assert.equal(branch.isTransacting(), true);
		branch.abortTransaction();
		assert.equal(branch.isTransacting(), true);
		branch.commitTransaction();
		assert.equal(branch.isTransacting(), false);
	});

	it("squash their commits when committing a transaction", () => {
		// Create a new branch and start a transaction
		const branch = create();
		branch.startTransaction();
		// Apply two changes to it
		const tag1 = change(branch);
		const tag2 = change(branch);
		// Ensure that the commits are in the correct order with the correct tags
		assertHistory(branch, tag1, tag2);
		// Commit the transaction and ensure that there is now only one commit on the branch
		branch.commitTransaction();
		assert.equal(branch.getHead().parent?.revision, nullRevisionTag);
	});

	it("rollback their commits when aborting a transaction", () => {
		// Create a new branch and apply one change before starting a transaction
		const branch = create();
		const tag1 = change(branch);
		branch.startTransaction();
		// Apply two more changes to it
		const tag2 = change(branch);
		const tag3 = change(branch);
		// Ensure that the commits are in the correct order with the correct tags
		assertHistory(branch, tag1, tag2, tag3);
		// Abort the transaction and ensure that there is now only one commit on the branch
		branch.abortTransaction();
		assert.equal(branch.getHead().revision, tag1);
	});

	it("allow transactions to nest", () => {
		// Create a new branch and open three transactions, applying one change in each
		const branch = create();
		branch.startTransaction();
		change(branch);
		branch.startTransaction();
		change(branch);
		branch.startTransaction();
		change(branch);
		// Commit the inner transaction, but abort the middle transaction so the inner one is moot
		branch.commitTransaction();
		branch.abortTransaction();
		// Ensure that the branch has only one commit on it
		assert.equal(branch.getHead().parent?.revision, nullRevisionTag);
		// Abort the last transaction as well, and ensure that the branch has no commits on it
		branch.abortTransaction();
		assert.equal(branch.getHead().revision, nullRevisionTag);
	});

	it("error if undo is called with no undo redo manager", () => {
		const branch = create();
		assert.throws(
			() => branch.undo(),
			(e) =>
				validateAssertionError(
					e,
					"Must construct branch with an `UndoRedoManager` in order to undo.",
				),
		);
	});

	it("error if redo is called with no undo redo manager", () => {
		const branch = create();
		assert.throws(
			() => branch.redo(),
			(e) =>
				validateAssertionError(
					e,
					"Must construct branch with an `UndoRedoManager` in order to redo.",
				),
		);
	});

	it("can rebase a non-revertible branch onto a revertible branch", () => {
		const branch = create();
		const revertibleBranch = createRevertible(branch);
		change(revertibleBranch);
		branch.rebaseOnto(revertibleBranch);
		assert.equal(branch.getHead(), revertibleBranch.getHead());
	});

	it("error when rebasing a revertible branch onto a non-revertible branch", () => {
		const branch = create();
		const revertibleBranch = createRevertible(branch);
		change(branch);
		assert.throws(
			() => revertibleBranch.rebaseOnto(branch),
			(e) =>
				validateAssertionError(
					e,
					"Cannot rebase a revertible branch onto a non-revertible branch",
				),
		);
	});

	it("can merge a revertible branch into a non-revertible branch", () => {
		const branch = create();
		const revertibleBranch = createRevertible(branch);
		change(revertibleBranch);
		branch.merge(revertibleBranch);
		assert.equal(branch.getHead(), revertibleBranch.getHead());
	});

	it("error when merging a non-revertible branch into a revertible branch", () => {
		const branch = create();
		const revertibleBranch = createRevertible(branch);
		change(branch);
		assert.throws(
			() => revertibleBranch.merge(branch),
			(e) =>
				validateAssertionError(
					e,
					"Cannot merge a non-revertible branch into a revertible branch",
				),
		);
	});

	/** Creates a new root branch */
	function create(
		onChange?: (change: SharedTreeBranchChange<DefaultChangeset>) => void,
	): DefaultBranch {
		const initCommit: GraphCommit<DefaultChangeset> = {
			change: defaultChangeFamily.rebaser.compose([]),
			revision: nullRevisionTag,
		};

		const branch = new SharedTreeBranch(
			initCommit,
			defaultChangeFamily,
			new MockRepairDataStoreProvider(),
		);
		if (onChange !== undefined) {
			branch.on("change", onChange);
		}

		return branch;
	}

	function createRevertible(from: DefaultBranch): DefaultBranch {
		return new SharedTreeBranch(
			from.getHead(),
			defaultChangeFamily,
			new MockRepairDataStoreProvider(),
			UndoRedoManager.create(defaultChangeFamily),
		);
	}

	let changeValue = 0;
	beforeEach(() => {
		changeValue = 0;
	});

	/** Apply an arbitrary but unique change to the given branch and return the tag for the new commit */
	function change(branch: DefaultBranch): RevisionTag {
		const cursor = singleTextCursor({ type: brand("TestValue"), value: changeValue });
		branch.editor.valueField({ parent: undefined, field: rootFieldKeySymbol }).set(cursor);
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
});

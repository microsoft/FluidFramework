/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	SquashingTransactionStack,
	SharedTreeBranch,
	TransactionResult,
	TransactionStack,
} from "../../shared-tree-core/index.js";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import {
	DefaultChangeFamily,
	type DefaultChangeset,
	type DefaultEditBuilder,
} from "../../feature-libraries/index.js";
import { chunkFromJsonableTrees, failCodecFamily, mintRevisionTag } from "../utils.js";
import {
	findAncestor,
	rootFieldKey,
	tagChange,
	type GraphCommit,
	type RevisionTag,
	type TaggedChange,
} from "../../core/index.js";
import { brand } from "../../util/index.js";

describe("TransactionStacks", () => {
	it("emit an event after starting a transaction", () => {
		const transaction = new TransactionStack();
		let started = false;
		transaction.events.on("started", () => {
			assert.equal(transaction.isInProgress(), true);
			started = true;
		});
		transaction.start();
		assert.equal(started, true);
	});

	it("emit an event just before aborting a transaction", () => {
		const transaction = new TransactionStack();
		let aborting = false;
		transaction.events.on("aborting", () => {
			assert.equal(transaction.isInProgress(), true);
			aborting = true;
		});
		transaction.start();
		transaction.abort();
		assert.equal(aborting, true);
	});

	it("emit an event just before committing a transaction", () => {
		const transaction = new TransactionStack();
		let committing = false;
		transaction.events.on("committing", () => {
			assert.equal(transaction.isInProgress(), true);
			committing = true;
		});
		transaction.start();
		transaction.commit();
		assert.equal(committing, true);
	});

	it("report whether or not a transaction is in progress", () => {
		const transaction = new TransactionStack();
		assert.equal(transaction.isInProgress(), false);
		transaction.start();
		assert.equal(transaction.isInProgress(), true);
		transaction.start();
		assert.equal(transaction.isInProgress(), true);
		transaction.commit();
		assert.equal(transaction.isInProgress(), true);
		transaction.abort();
		assert.equal(transaction.isInProgress(), false);
	});

	it("run a function when a transaction begins", () => {
		let invoked = 0;
		const transaction = new TransactionStack((): void => {
			invoked += 1;
			assert.equal(transaction.isInProgress(), false);
		});
		transaction.start();
		assert.equal(invoked, 1);
	});

	it("run the top-level push function by default when a nested transaction begins", () => {
		let invoked = 0;
		const transaction = new TransactionStack((): void => {
			invoked += 1;
			assert.equal(transaction.isInProgress(), invoked > 1);
		});
		transaction.start();
		assert.equal(invoked, 1);
		transaction.start();
		assert.equal(invoked, 2);
		transaction.start();
		assert.equal(invoked, 3);
	});

	it("run a provided nested push function when a nested transaction begins", () => {
		let invokedOuter = 0;
		let invokedInner1 = 0;
		let invokedInner2 = 0;
		const transaction: TransactionStack = new TransactionStack(() => {
			invokedOuter += 1;
			assert.equal(transaction.isInProgress(), false);
			return {
				onPush: () => {
					invokedInner1 += 1;
					assert.equal(transaction.isInProgress(), true);
					return {
						onPush: () => {
							invokedInner2 += 1;
							assert.equal(transaction.isInProgress(), true);
						},
					};
				},
			};
		});
		transaction.start();
		assert.equal(invokedOuter, 1);
		assert.equal(invokedInner1, 0);
		assert.equal(invokedInner2, 0);
		transaction.start();
		assert.equal(invokedOuter, 1);
		assert.equal(invokedInner1, 1);
		assert.equal(invokedInner2, 0);
		transaction.start();
		assert.equal(invokedOuter, 1);
		assert.equal(invokedInner1, 1);
		assert.equal(invokedInner2, 1);
		transaction.start();
		assert.equal(invokedOuter, 1);
		assert.equal(invokedInner1, 1);
		assert.equal(invokedInner2, 2);
	});

	it("run a provided nested pop function when a nested transaction ends", () => {
		let invokedOuter = 0;
		let invokedInner1 = 0;
		let invokedInner2 = 0;
		const transaction: TransactionStack = new TransactionStack(() => {
			return {
				onPop: () => {
					invokedOuter += 1;
					assert.equal(transaction.isInProgress(), false);
				},
				onPush: () => {
					return {
						onPop: () => {
							invokedInner1 += 1;
							assert.equal(transaction.isInProgress(), true);
						},
						onPush: () => {
							return {
								onPop: () => {
									invokedInner2 += 1;
									assert.equal(transaction.isInProgress(), true);
								},
							};
						},
					};
				},
			};
		});
		transaction.start();
		transaction.start();
		transaction.start();
		transaction.commit();
		assert.equal(invokedOuter, 0);
		assert.equal(invokedInner1, 0);
		assert.equal(invokedInner2, 1);
		transaction.commit();
		assert.equal(invokedOuter, 0);
		assert.equal(invokedInner1, 1);
		assert.equal(invokedInner2, 1);
		transaction.commit();
		assert.equal(invokedOuter, 1);
		assert.equal(invokedInner1, 1);
		assert.equal(invokedInner2, 1);
	});

	it("run a function when a transaction aborts", () => {
		let invoked = 0;
		const transaction: TransactionStack = new TransactionStack(() => {
			return {
				onPop: (result) => {
					invoked += 1;
					assert.equal(result, TransactionResult.Abort);
					assert.equal(transaction.isInProgress(), false);
				},
			};
		});
		transaction.start();
		assert.equal(invoked, 0);
		transaction.abort();
		assert.equal(invoked, 1);
	});

	it("run a function when a transaction commits", () => {
		let invoked = 0;
		const transaction: TransactionStack = new TransactionStack(() => {
			return {
				onPop: (result) => {
					invoked += 1;
					assert.equal(result, TransactionResult.Commit);
					assert.equal(transaction.isInProgress(), false);
				},
			};
		});
		transaction.start();
		assert.equal(invoked, 0);
		transaction.commit();
		assert.equal(invoked, 1);
	});

	it("throw an error if committing without starting a transaction", () => {
		const transaction = new TransactionStack();
		assert.throws(
			() => transaction.commit(),
			validateAssertionError("No transaction to commit"),
		);
	});

	it("throw an error if aborting without starting a transaction", () => {
		const transaction = new TransactionStack();
		assert.throws(
			() => transaction.abort(),
			validateAssertionError("No transaction to abort"),
		);
	});

	it("can't be used after disposal", () => {
		const transaction = new TransactionStack();
		assert.equal(transaction.disposed, false);
		transaction.dispose();
		assert.equal(transaction.disposed, true);
		assert.throws(
			() => transaction.isInProgress(),
			validateAssertionError("Transactor is disposed"),
		);
		assert.throws(() => transaction.start(), validateAssertionError("Transactor is disposed"));
		assert.throws(
			() => transaction.commit(),
			validateAssertionError("Transactor is disposed"),
		);
		assert.throws(() => transaction.abort(), validateAssertionError("Transactor is disposed"));
		assert.throws(
			() => transaction.dispose(),
			validateAssertionError("Transactor is disposed"),
		);
	});

	it("abort all transactions when disposed", () => {
		let aborted = 0;
		const transaction = new TransactionStack(() => {
			return {
				onPop: () => {
					aborted += 1;
				},
			};
		});
		transaction.start();
		transaction.start();
		transaction.dispose();
		assert.equal(aborted, 2);
	});
});

describe("SquashingTransactionStacks", () => {
	it("squash transactions", () => {
		const branch = createBranch();
		let squashCount = 0;
		const transaction = new SquashingTransactionStack(branch, (commits) => {
			squashCount += 1;
			return squash(commits);
		});
		assert.equal(transaction.activeBranch, branch);
		transaction.start();
		assert.notEqual(transaction.activeBranch, branch);
		editBranch(transaction.activeBranch, "B");
		transaction.start();
		assert.notEqual(transaction.activeBranch, branch);
		editBranch(transaction.activeBranch, "C");
		transaction.commit();
		assert.equal(squashCount, 0); // Squash should only be called for the outermost transaction commit
		assert.notEqual(transaction.activeBranch, branch);
		transaction.commit();
		assert.equal(squashCount, 1);
		assert.equal(transaction.activeBranch, branch);
		assert.equal(edits(branch), 1); // Only one (squashed) commit should be on the branch after the initial commit, not two (unsquashed)
	});

	it("transfer events between active branches", () => {
		const branch = createBranch();
		const transaction = new SquashingTransactionStack(branch, squash);

		let originalEventCount = 0;
		transaction.branch.events.on("afterChange", () => {
			originalEventCount += 1;
		});

		let activeEventCount = 0;
		transaction.activeBranchEvents.on("afterChange", (event) => {
			if (event.type === "append") {
				assert(event.newCommits.length === 1);
				assert.equal(event.newCommits[0], transaction.activeBranch.getHead());
				activeEventCount += 1;
			}
		});

		editBranch(transaction.activeBranch, "A"); // Original branch should be updated
		transaction.start();
		editBranch(transaction.activeBranch, "B"); // Transaction branch should be updated
		transaction.abort();
		editBranch(transaction.activeBranch, "C"); // Original branch should be updated
		transaction.start();
		editBranch(transaction.activeBranch, "D"); // Transaction branch should be updated
		transaction.commit();
		editBranch(transaction.activeBranch, "E"); // Original branch should be updated

		assert.equal(originalEventCount, 4); // 3 out-of-transaction edits + 1 squash commit
		assert.equal(activeEventCount, 5); // 5 edits overall
	});

	it("delegate edits to the active branch", () => {
		const branch = createBranch();
		const transaction = new SquashingTransactionStack(branch, squash);
		const editor = transaction.activeBranchEditor; // We'll hold on to this editor across the transaction
		assert.equal(edits(branch), 0);
		assert.equal(transaction.activeBranch, branch);
		edit(editor, "A");
		assert.equal(edits(branch), 1);
		assert.equal(transaction.activeBranch, branch);
		transaction.start();
		edit(editor, "B");
		assert.equal(edits(branch), 1);
		assert.equal(edits(transaction.activeBranch), 2);
		transaction.abort();
		edit(editor, "C");
		assert.equal(edits(branch), 2);
		assert.equal(transaction.activeBranch, branch);
		transaction.start();
		edit(editor, "D");
		assert.equal(edits(branch), 2);
		assert.equal(edits(transaction.activeBranch), 3);
		transaction.commit();
		edit(editor, "E");
		assert.equal(edits(branch), 4); // 3 out-of-transaction edits + 1 squash commit
		assert.equal(transaction.activeBranch, branch);
	});

	type DefaultBranch = SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>;
	const defaultChangeFamily = new DefaultChangeFamily(failCodecFamily);
	const initialRevision = mintRevisionTag();

	function createBranch(): DefaultBranch {
		const initCommit: GraphCommit<DefaultChangeset> = {
			change: defaultChangeFamily.rebaser.compose([]),
			revision: initialRevision,
		};

		return new SharedTreeBranch(initCommit, defaultChangeFamily, mintRevisionTag);
	}

	function editBranch(branch: DefaultBranch, value: string): RevisionTag {
		edit(branch.editor, value);
		return branch.getHead().revision;
	}

	function edit(editor: DefaultEditBuilder, value: string): void {
		const content = chunkFromJsonableTrees([{ type: brand("TestValue"), value }]);
		editor.valueField({ parent: undefined, field: rootFieldKey }).set(content);
	}

	function squash(commits: GraphCommit<DefaultChangeset>[]): TaggedChange<DefaultChangeset> {
		return tagChange(defaultChangeFamily.rebaser.compose(commits), mintRevisionTag());
	}

	/** The number of commits on the given branch, not including the initial commit */
	function edits(branch: DefaultBranch): number {
		const commits: GraphCommit<DefaultChangeset>[] = [];
		const ancestor = findAncestor([branch.getHead(), commits]);
		assert.equal(ancestor.revision, initialRevision);
		return commits.length;
	}
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	findAncestor,
	rootFieldKey,
	type GraphCommit,
	type RevisionTag,
} from "../../core/index.js";
import {
	DefaultChangeFamily,
	type DefaultChangeset,
	type DefaultEditBuilder,
} from "../../feature-libraries/index.js";
import { FluidClientVersion, FormatValidatorBasic } from "../../index.js";
import {
	SquashingTransactionStack,
	SharedTreeBranch,
	TransactionResult,
	TransactionStack,
	type ChangeProcessor,
	ChangeProcessorApplicability,
} from "../../shared-tree-core/index.js";
import { brand } from "../../util/index.js";
import { chunkFromJsonableTrees, failCodecFamily, mintRevisionTag } from "../utils.js";

describe("TransactionStacks", () => {
	it("emit an event after starting a transaction", () => {
		const transaction = new TransactionStack();
		let started = false;
		transaction.events.on("started", () => {
			assert.equal(transaction.size, 1);
			started = true;
		});
		transaction.start();
		assert.equal(started, true);
	});

	it("emit an event just before aborting a transaction", () => {
		const transaction = new TransactionStack();
		let aborting = false;
		transaction.events.on("aborting", () => {
			assert.equal(transaction.size, 1);
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
			assert.equal(transaction.size, 1);
			committing = true;
		});
		transaction.start();
		transaction.commit();
		assert.equal(committing, true);
	});

	it("report whether or not a transaction is in progress", () => {
		const transaction = new TransactionStack();
		assert.equal(transaction.size, 0);
		transaction.start();
		assert.equal(transaction.size, 1);
		transaction.start();
		assert.equal(transaction.size, 2);
		transaction.commit();
		assert.equal(transaction.size, 1);
		transaction.abort();
		assert.equal(transaction.size, 0);
	});

	it("report the number of transactions in progress", () => {
		const transaction = new TransactionStack();
		assert.equal(transaction.size, 0);
		transaction.start();
		assert.equal(transaction.size, 1);
		transaction.start();
		assert.equal(transaction.size, 2);
		transaction.start();
		assert.equal(transaction.size, 3);
		transaction.commit();
		assert.equal(transaction.size, 2);
		transaction.abort();
		assert.equal(transaction.size, 1);
		transaction.commit();
		assert.equal(transaction.size, 0);
	});

	it("run a function when a transaction begins", () => {
		let invoked = 0;
		const transaction = new TransactionStack((): void => {
			invoked += 1;
			assert.equal(transaction.size, 0);
		});
		transaction.start();
		assert.equal(invoked, 1);
	});

	it("run the top-level push function by default when a nested transaction begins", () => {
		let invoked = 0;
		const transaction = new TransactionStack((): void => {
			invoked += 1;
			assert.equal(transaction.size, invoked - 1);
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
		const transaction: TransactionStack<unknown> = new TransactionStack(() => {
			invokedOuter += 1;
			assert.equal(transaction.size, 0);
			return {
				onPush: () => {
					invokedInner1 += 1;
					assert.equal(transaction.size, 1);
					return {
						onPush: () => {
							invokedInner2 += 1;
							assert.equal(transaction.size, invokedInner2 + 1);
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
		const transaction: TransactionStack<unknown> = new TransactionStack(() => {
			return {
				onPop: () => {
					invokedOuter += 1;
					assert.equal(transaction.size, 0);
				},
				onPush: () => {
					return {
						onPop: () => {
							invokedInner1 += 1;
							assert.equal(transaction.size, 1);
						},
						onPush: () => {
							return {
								onPop: () => {
									invokedInner2 += 1;
									assert.equal(transaction.size, 2);
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
		const transaction: TransactionStack<unknown> = new TransactionStack(() => {
			return {
				onPop: (result) => {
					invoked += 1;
					assert.equal(result, TransactionResult.Abort);
					assert.equal(transaction.size, 0);
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
		const transaction: TransactionStack<unknown> = new TransactionStack(() => {
			return {
				onPop: (result) => {
					invoked += 1;
					assert.equal(result, TransactionResult.Commit);
					assert.equal(transaction.size, 0);
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
		assert.throws(() => transaction.size, validateAssertionError("Transactor is disposed"));
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
		const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
		assert.equal(transaction.activeBranch, branch);
		transaction.start();
		assert.notEqual(transaction.activeBranch, branch);
		editBranch(transaction.activeBranch, "B");
		transaction.start();
		assert.notEqual(transaction.activeBranch, branch);
		editBranch(transaction.activeBranch, "C");
		transaction.commit();
		assert.notEqual(transaction.activeBranch, branch);
		transaction.commit();
		assert.equal(transaction.activeBranch, branch);
		assert.equal(edits(branch), 1); // Only one (squashed) commit should be on the branch after the initial commit, not two (unsquashed)
	});

	it("transfer events between active branches", () => {
		const branch = createBranch();
		const transaction = new SquashingTransactionStack(branch, mintRevisionTag);

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
		const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
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

	describe("transaction post-processing", () => {
		/**
		 * Creates a {@link SquashingTransactionStack} along with a spy {@link ChangeProcessor | post-processor} that
		 * records the changes it receives (and returns them unchanged).
		 */
		function createWithSpyProcessor(applicability: ChangeProcessorApplicability): {
			transaction: SquashingTransactionStack<DefaultEditBuilder, DefaultChangeset>;
			branch: DefaultBranch;
			/** A post-processor to pass via the transaction options. */
			postProcessor: ChangeProcessor<DefaultChangeset>;
			/** The changes passed to the post-processor, in invocation order. */
			received: DefaultChangeset[];
		} {
			const branch = createBranch();
			const received: DefaultChangeset[] = [];
			const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
			const postProcessor: ChangeProcessor<DefaultChangeset> = {
				applicability,
				processChange: (change) => {
					received.push(change);
					return change;
				},
			};
			return { transaction, branch, postProcessor, received };
		}

		/**
		 * Creates a spy {@link ChangeProcessor | post-processor} that records the changes it receives (and returns them
		 * unchanged), tagged with the given label for identification in assertions.
		 */
		function createSpyProcessor(
			applicability: ChangeProcessorApplicability,
			received: { processor: string; change: DefaultChangeset }[],
			label: string,
		): ChangeProcessor<DefaultChangeset> {
			return {
				applicability,
				processChange: (change) => {
					received.push({ processor: label, change });
					return change;
				},
			};
		}

		it("is invoked with the squashed change when started with a post-processor", () => {
			// Setup
			const { transaction, branch, postProcessor, received } = createWithSpyProcessor(
				ChangeProcessorApplicability.Always,
			);
			transaction.start({ postProcessor });
			editBranch(transaction.activeBranch, "A");
			editBranch(transaction.activeBranch, "B");

			// Act
			transaction.commit();

			// Verify
			assert.equal(received.length, 1);
			// The change passed to the post-processor is the one that ends up on the branch (when no concurrent edits occurred).
			assert.equal(branch.getHead().change, received[0]);
			assert.equal(edits(branch), 1);
		});

		it("is not invoked when the transaction is empty", () => {
			// Setup
			const { transaction, postProcessor, received } = createWithSpyProcessor(
				ChangeProcessorApplicability.Always,
			);
			transaction.start({ postProcessor });
			// No edits made during the transaction.

			// Act
			transaction.commit();

			// Verify
			assert.equal(received.length, 0);
		});

		it("is not invoked when the transaction is aborted", () => {
			// Setup
			const { transaction, postProcessor, received } = createWithSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
			);
			transaction.start({ postProcessor });
			editBranch(transaction.activeBranch, "A");

			// Act
			transaction.abort();

			// Verify
			assert.equal(received.length, 0);
		});

		it(`invokes an "outermost" post-processor once for the outermost transaction started`, () => {
			// Setup
			const { transaction, postProcessor, received } = createWithSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
			);
			transaction.start({ postProcessor });
			editBranch(transaction.activeBranch, "A");
			transaction.start({ postProcessor });
			editBranch(transaction.activeBranch, "B");

			// Act
			transaction.commit(); // inner commit

			// Verify
			// Committing the nested (inner) transaction does not post-process, because an enclosing transaction already supplied a post-processor.
			assert.equal(received.length, 0);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// Post-processing happens once, when the outermost transaction that supplied a post-processor is committed.
			assert.equal(received.length, 1);
		});

		it(`invokes the "outermost" post-processor for an inner transaction when the outer has no post-processor`, () => {
			// Setup
			const { transaction, postProcessor, received } = createWithSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
			);
			transaction.start(); // outer transaction without a post-processor
			editBranch(transaction.activeBranch, "A");
			transaction.start({ postProcessor }); // inner transaction with a post-processor
			editBranch(transaction.activeBranch, "B");

			// Act
			transaction.commit(); // inner commit

			// Verify
			// The inner transaction is the outermost one that supplied a post-processor, so it is post-processed when committed.
			assert.equal(received.length, 1);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// The outermost transaction did not supply a post-processor, so committing it does not invoke one again.
			assert.equal(received.length, 1);
		});

		it(`invokes the "outermost" post-processor for an inner transaction when the outer has different post-processor`, () => {
			// Setup
			const received: { processor: string; change: DefaultChangeset }[] = [];
			const branch = createBranch();
			const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
			const outerOutermost = createSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
				received,
				"outer",
			);
			const innerOutermost = createSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
				received,
				"inner",
			);
			transaction.start({ postProcessor: outerOutermost }); // outer transaction with a post-processor
			editBranch(transaction.activeBranch, "A");
			transaction.start({ postProcessor: innerOutermost }); // inner transaction with a post-processor
			editBranch(transaction.activeBranch, "B");

			// Act
			transaction.commit(); // inner commit

			// Verify
			// The inner transaction is the outermost one that supplied that
			// specific post-processor, so it is post-processed when committed.
			assert.equal(received.length, 1);
			assert.deepEqual(
				received.map((r) => r.processor),
				["inner"],
			);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// The outermost transaction supplied a unique post-processor, so
			// committing outer does invoke that post-processor.
			assert.equal(received.length, 2);
			assert.deepEqual(
				received.map((r) => r.processor),
				["inner", "outer"],
			);
		});

		it(`invokes an "always" post-processor at every transaction commit that supplied it`, () => {
			// Setup
			const { transaction, postProcessor, received } = createWithSpyProcessor(
				ChangeProcessorApplicability.Always,
			);
			transaction.start({ postProcessor }); // outer
			editBranch(transaction.activeBranch, "A");
			transaction.start({ postProcessor }); // inner with the same "always" post-processor
			editBranch(transaction.activeBranch, "B");

			// Act
			transaction.commit(); // inner commit

			// Verify
			// The inner transaction supplied an "always" post-processor, so it is invoked even though an enclosing
			// transaction also supplied it.
			assert.equal(received.length, 1);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// The outer transaction also supplied the "always" post-processor, so it is invoked again on commit.
			assert.equal(received.length, 2);
		});

		it(`invokes an "always" post-processor only where it was supplied`, () => {
			// Setup
			const { transaction, postProcessor, received } = createWithSpyProcessor(
				ChangeProcessorApplicability.Always,
			);
			transaction.start({ postProcessor }); // outer with an "always" post-processor
			editBranch(transaction.activeBranch, "A");
			transaction.start(); // inner without a post-processor
			editBranch(transaction.activeBranch, "B");

			// Act
			transaction.commit(); // inner commit

			// Verify
			// The inner transaction did not supply a post-processor, so committing it does not invoke one.
			assert.equal(received.length, 0);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// The outer transaction supplied the "always" post-processor, so it is invoked on commit.
			assert.equal(received.length, 1);
		});

		it(`invokes an "outermost" post-processor once per sibling nested transaction that supplied it`, () => {
			// Setup
			// An outer transaction without a post-processor that has two sequential (sibling) nested transactions, the
			// first of which commits before the second begins. Each sibling supplies the same "outermost" post-processor.
			const received: { processor: string; change: DefaultChangeset }[] = [];
			const branch = createBranch();
			const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
			const postProcessor = createSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
				received,
				"outermost",
			);
			transaction.start(); // outer (no post-processor)
			editBranch(transaction.activeBranch, "A");

			// Act
			transaction.start({ postProcessor }); // first nested
			editBranch(transaction.activeBranch, "B");
			transaction.commit(); // first nested commit

			// Verify
			// The first nested transaction is the outermost one supplying the post-processor, so it is invoked.
			assert.equal(received.length, 1);

			// Act
			transaction.start({ postProcessor }); // second nested (sibling)
			editBranch(transaction.activeBranch, "C");
			transaction.commit(); // second nested commit

			// Verify
			// The first sibling has already popped, so the second sibling is independently "outermost" and invokes again.
			assert.equal(received.length, 2);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// The outer transaction did not supply a post-processor, so committing it does not invoke one.
			assert.equal(received.length, 2);
		});

		it(`invokes an "outermost" post-processor once when the outer and both sibling nested transactions supply it`, () => {
			// Setup
			const received: { processor: string; change: DefaultChangeset }[] = [];
			const branch = createBranch();
			const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
			const postProcessor = createSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
				received,
				"outermost",
			);
			transaction.start({ postProcessor }); // outer
			editBranch(transaction.activeBranch, "A");

			// Act
			transaction.start({ postProcessor }); // first nested
			editBranch(transaction.activeBranch, "B");
			transaction.commit(); // first nested commit
			transaction.start({ postProcessor }); // second nested (sibling)
			editBranch(transaction.activeBranch, "C");
			transaction.commit(); // second nested commit

			// Verify
			// Both nested transactions are enclosed by the outer one that already supplied the "outermost" post-processor,
			// so neither nested commit invokes it.
			assert.equal(received.length, 0);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// Only the outermost transaction that supplied the "outermost" post-processor invokes it.
			assert.equal(received.length, 1);
		});

		it(`invokes a mix of "outermost" and "always" post-processors in the expected order`, () => {
			// Setup
			// An outer transaction supplies an "always" post-processor; two sequential (sibling) nested transactions each
			// supply the same "outermost" post-processor.
			const received: { processor: string; change: DefaultChangeset }[] = [];
			const branch = createBranch();
			const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
			const always = createSpyProcessor(
				ChangeProcessorApplicability.Always,
				received,
				"always",
			);
			const outermost = createSpyProcessor(
				ChangeProcessorApplicability.IfOutermost,
				received,
				"outermost",
			);
			transaction.start({ postProcessor: always }); // outer
			editBranch(transaction.activeBranch, "A");

			// Act
			transaction.start({ postProcessor: outermost }); // first nested
			editBranch(transaction.activeBranch, "B");
			transaction.commit(); // first nested commit
			transaction.start({ postProcessor: outermost }); // second nested (sibling)
			editBranch(transaction.activeBranch, "C");
			transaction.commit(); // second nested commit

			// Verify
			// Each sibling nested transaction is independently "outermost" for the "outermost" post-processor, so each
			// invokes it once. The "always" post-processor was not supplied to the nested transactions, so it is not yet
			// invoked.
			assert.deepEqual(
				received.map((r) => r.processor),
				["outermost", "outermost"],
			);

			// Act
			transaction.commit(); // outer commit

			// Verify
			// The outer transaction's "always" post-processor is invoked when it commits.
			assert.deepEqual(
				received.map((r) => r.processor),
				["outermost", "outermost", "always"],
			);
		});

		it("applies the change returned by the post-processor to the branch", () => {
			// Setup
			const branch = createBranch();
			// A post-processor that replaces the squashed change with an empty change.
			const replacement = defaultChangeFamily.rebaser.compose([]);
			const postProcessor: ChangeProcessor<DefaultChangeset> = {
				applicability: ChangeProcessorApplicability.IfOutermost,
				processChange: () => replacement,
			};
			const transaction = new SquashingTransactionStack(branch, mintRevisionTag);
			transaction.start({ postProcessor });
			editBranch(transaction.activeBranch, "A");
			editBranch(transaction.activeBranch, "B");

			// Act
			transaction.commit();

			// Verify
			assert.equal(edits(branch), 1);
			assert.equal(branch.getHead().change, replacement);
		});
	});

	type DefaultBranch = SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>;
	const defaultChangeFamily = new DefaultChangeFamily(failCodecFamily, {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v2_0,
	});
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

	/** The number of commits on the given branch, not including the initial commit */
	function edits(branch: DefaultBranch): number {
		const commits: GraphCommit<DefaultChangeset>[] = [];
		const ancestor = findAncestor([branch.getHead(), commits]);
		assert.equal(ancestor.revision, initialRevision);
		return commits.length;
	}
});

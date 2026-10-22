/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import type { RevertibleAlpha } from "../../core/index.js";
import {
	BranchCheckout,
	CheckoutBase,
	TreeCheckout,
	forkAsBranchCheckout,
	forkBranch,
	getViewOfBranch,
	type TreeBranchHandleAlpha,
} from "../../shared-tree/index.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import type { isAssignableTo, requireFalse, requireTrue } from "../../util/index.js";
import { getView, TestTreeProviderLite } from "../utils.js";

const enableSchemaValidation = true;

type _CheckoutCapabilities =
	| requireTrue<isAssignableTo<TreeCheckout, CheckoutBase>>
	| requireTrue<isAssignableTo<BranchCheckout, CheckoutBase>>
	| requireTrue<isAssignableTo<BranchCheckout, TreeBranchHandleAlpha>>
	| requireTrue<
			isAssignableTo<{ readonly disposed: boolean; dispose(): void }, TreeBranchHandleAlpha>
	  >
	| requireFalse<isAssignableTo<BranchCheckout, TreeCheckout>>
	| requireFalse<isAssignableTo<"switchBranch", keyof BranchCheckout>>
	| requireFalse<isAssignableTo<"rewindTo", keyof BranchCheckout>>
	| requireFalse<isAssignableTo<"switchBranch", keyof CheckoutBase>>
	| requireFalse<isAssignableTo<"rewindTo", keyof CheckoutBase>>;

describe("BranchCheckout", () => {
	const schemaFactory = new SchemaFactory("BranchCheckout test schema");
	const Root = schemaFactory.object("Root", { x: schemaFactory.number });
	const config = new TreeViewConfiguration({ enableSchemaValidation, schema: Root });

	function makeView() {
		const view = getView(config);
		view.initialize({ x: 0 });
		return view;
	}

	describe("getViewOfBranch", () => {
		it("returns a view bound to the given BranchCheckout", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchViewA = getViewOfBranch(branchCheckout, config);
			branchViewA.root.x = 99;
			branchViewA.dispose();
			assert.strictEqual(branchCheckout.disposed, false);
			const branchViewB = getViewOfBranch(branchCheckout, config);
			assert.strictEqual(branchViewB.root.x, 99);
			assert.strictEqual(view.root.x, 0);
		});

		it("throws when passed a non-BranchCheckout TreeCheckout", () => {
			const view = makeView();
			assert.throws(
				() => getViewOfBranch(view.checkout, config),
				validateUsageError(/must be a branch returned by `forkBranch`/),
			);
		});

		it("throws when the branch already has a live view", () => {
			const branch = forkBranch(makeView());
			const first = getViewOfBranch(branch, config);
			assert.throws(
				() => getViewOfBranch(branch, config),
				validateUsageError(/Cannot create a second tree view/),
			);
			first.dispose();
			getViewOfBranch(branch, config).dispose();
		});

		it("throws when the branch is disposed", () => {
			const branch = forkBranch(makeView());
			branch.dispose();
			assert.equal(branch.disposed, true);
			assert.throws(() => getViewOfBranch(branch, config), validateUsageError(/disposed/));
		});

		it("does not support rewindTo on the returned view", () => {
			const branch = forkBranch(makeView());
			const branchView = getViewOfBranch(branch, config);
			assert(branch instanceof BranchCheckout);
			const revision = branch.branchHistory.getHead()?.revision;
			assert(revision !== undefined);
			assert.throws(
				() => branchView.rewindTo(revision),
				validateUsageError(/Rewinding is not supported on a branch/),
			);
		});

		it("rejects a view even though it structurally matches a branch handle", () => {
			const view = makeView();
			assert.throws(
				() => getViewOfBranch(view, config),
				validateUsageError(/must be a branch returned by `forkBranch`/),
			);
		});

		it("rejects an external implementation of a branch handle", () => {
			const branch: TreeBranchHandleAlpha = {
				disposed: false,
				dispose() {},
			};
			assert.throws(
				() => getViewOfBranch(branch, config),
				validateUsageError(/must be a branch returned by `forkBranch`/),
			);
		});
	});

	describe("forkBranch", () => {
		it("creates independent branches on every call", () => {
			const view = makeView();
			const branchA = forkBranch(view);
			const branchB = forkBranch(view);
			assert.notStrictEqual(branchA, branchB);
			const branchViewA = getViewOfBranch(branchA, config);
			const branchViewB = getViewOfBranch(branchB, config);

			branchViewA.root.x = 5;
			assert.strictEqual(branchViewA.root.x, 5);
			assert.strictEqual(branchViewB.root.x, 0);
			assert.strictEqual(view.root.x, 0);
			branchViewA.dispose();
			branchViewB.dispose();
			branchA.dispose();
			branchB.dispose();
		});

		it("creates a new independent branch when the view already belongs to a BranchCheckout", () => {
			const view = makeView();
			const registeredBranch = forkAsBranchCheckout(view.checkout);
			const childView = getViewOfBranch(registeredBranch, config);
			const childBranch = forkBranch(childView);
			const siblingBranch = forkBranch(childView);
			assert.notStrictEqual(childBranch, registeredBranch);
			assert.notStrictEqual(childBranch, siblingBranch);

			const childBranchView = getViewOfBranch(childBranch, config);
			const siblingBranchView = getViewOfBranch(siblingBranch, config);
			childBranchView.root.x = 5;
			assert.strictEqual(childBranchView.root.x, 5);
			assert.strictEqual(siblingBranchView.root.x, 0);
			assert.strictEqual(childView.root.x, 0);
			assert.strictEqual(view.root.x, 0);

			childBranchView.dispose();
			childBranch.dispose();
			assert.strictEqual(childBranch.disposed, true);
			assert.strictEqual(siblingBranch.disposed, false);
			siblingBranchView.root.x = 8;
			assert.strictEqual(siblingBranchView.root.x, 8);
			assert.strictEqual(childView.root.x, 0);
			assert.strictEqual(view.root.x, 0);

			siblingBranchView.dispose();
			siblingBranch.dispose();
			childView.dispose();
			registeredBranch.dispose();
		});

		it("merges branch changes into the source and disposes the merged branch", () => {
			const view = makeView();
			const branch = forkBranch(view);
			const branchView = getViewOfBranch(branch, config);
			branchView.root.x = 7;

			assert.strictEqual(view.root.x, 0);
			view.merge(branchView);
			assert.strictEqual(view.root.x, 7);
			assert.strictEqual(branch.disposed, true);
		});

		it("throws when the view is disposed even if its branch is still alive", () => {
			const view = makeView();
			const branch = forkBranch(view);
			try {
				const branchView = getViewOfBranch(branch, config);
				branchView.root.x = 3;
				branchView.dispose();
				assert.strictEqual(branchView.disposed, true);
				assert.strictEqual(branch.disposed, false);

				assert.throws(
					() => forkBranch(branchView),
					validateUsageError("A disposed view cannot be forked."),
				);

				const replacementView = getViewOfBranch(branch, config);
				assert.strictEqual(replacementView.root.x, 3);
				replacementView.root.x = 5;
				assert.strictEqual(replacementView.root.x, 5);
			} finally {
				branch.dispose();
				view.dispose();
			}
		});

		it("throws when passed a non-SchematizingSimpleTreeView", () => {
			const view = makeView();
			assert.throws(
				() => forkBranch(view.checkout as TreeCheckout),
				validateUsageError(/external implementations are not supported/),
			);
		});
	});

	describe("construction", () => {
		it("returns a sibling of TreeCheckout with the same common base", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.ok(branchCheckout instanceof BranchCheckout);
			assert.ok(branchCheckout instanceof CheckoutBase);
			assert.ok(view.checkout instanceof CheckoutBase);
			assert.equal(branchCheckout instanceof TreeCheckout, false);
			assert.equal(view.checkout.isView(), true);
			assert.equal(view.checkout.isBranch(), true);
		});

		it("the forked checkout is independent from the parent", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.notStrictEqual(branchCheckout, view.checkout);
			assert.notStrictEqual(branchCheckout.forest, view.checkout.forest);
			assert.notStrictEqual(branchCheckout.storedSchema, view.checkout.storedSchema);
		});

		it("isSharedBranch is false", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.strictEqual(branchCheckout.isSharedBranch, false);
		});

		it("rejects construction over a shared branch", () => {
			const view = makeView();
			assert.throws(
				() =>
					view.checkout.forkWith(
						(options) => new BranchCheckout({ ...options, isSharedBranch: true }),
					),
				/BranchCheckout cannot represent a shared branch/,
			);
		});

		it("forkAsBranchCheckout throws if the parent is in a broken state", () => {
			const view = makeView();
			assert.throws(() => view.checkout.breaker.break(new Error("broken parent")));
			assert.throws(
				() => forkAsBranchCheckout(view.checkout),
				validateUsageError(/broken parent/),
			);
		});

		it("inherits disposeForksAfterTransaction from the parent", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.strictEqual(
				branchCheckout.disposeForksAfterTransaction,
				view.checkout.disposeForksAfterTransaction,
			);
			const grandchild = branchCheckout.fork();
			assert.strictEqual(
				grandchild.disposeForksAfterTransaction,
				view.checkout.disposeForksAfterTransaction,
			);
		});
	});

	describe("viewless", () => {
		it("can materialize a view on demand via viewWith", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchView = branchCheckout.viewWith(config);
			assert.strictEqual(branchView.root.x, 0);
		});

		it("each forkAsBranchCheckout has its own forest, so each can be viewed independently", () => {
			const view = makeView();
			const a = forkAsBranchCheckout(view.checkout);
			const b = forkAsBranchCheckout(view.checkout);
			const viewA = a.viewWith(config);
			const viewB = b.viewWith(config);
			assert.notStrictEqual(a.forest, b.forest);
			viewA.root.x = 1;
			viewB.root.x = 2;
			assert.strictEqual(viewA.root.x, 1);
			assert.strictEqual(viewB.root.x, 2);
		});
	});

	describe("permanently bound to its branch", () => {
		it("does not expose branch switching or rewind operations", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.equal("switchBranch" in branchCheckout, false);
			assert.equal("rewindTo" in branchCheckout, false);
			assert.equal(branchCheckout.isView(), false);
			assert.equal(branchCheckout.isBranch(), false);
		});

		it("fork() returns another BranchCheckout", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const forked = branchCheckout.fork();
			assert.ok(forked instanceof BranchCheckout);
		});

		it("forkAsBranchCheckout chains: forking a BranchCheckout yields an independent BranchCheckout", () => {
			const view = makeView();
			const parent = forkAsBranchCheckout(view.checkout);
			const child = forkAsBranchCheckout(parent);

			assert.ok(child instanceof BranchCheckout);
			assert.notStrictEqual(child, parent);
			assert.notStrictEqual(child.mainBranch, parent.mainBranch);
			assert.notStrictEqual(child.forest, parent.forest);

			const childView = child.viewWith(config);
			childView.root.x = 11;
			const parentView = parent.viewWith(config);
			assert.strictEqual(parentView.root.x, 0);
			assert.strictEqual(view.root.x, 0);
			assert.strictEqual(childView.root.x, 11);
		});
	});

	describe("edits and merges", () => {
		for (const retainedSource of [false, true]) {
			it(`clones revertibles from a ${retainedSource ? "retained" : "retargetable"} checkout to its sibling type`, () => {
				const view = makeView();
				const source = view.checkout.forkWith((options) =>
					retainedSource ? new BranchCheckout(options) : new TreeCheckout(options),
				);
				const sourceView = source.viewWith(config);
				const revertibles: RevertibleAlpha[] = [];
				const unsubscribe = source.events.on("changed", (_data, getRevertible) => {
					const revertible = getRevertible?.();
					assert(revertible !== undefined);
					revertibles.push(revertible);
				});
				sourceView.root.x = 1;
				unsubscribe();
				const target = source.forkWith((options) =>
					retainedSource ? new TreeCheckout(options) : new BranchCheckout(options),
				);
				try {
					const targetView = target.viewWith(config);
					const [revertible] = revertibles;
					assert(revertible !== undefined);
					const clone = revertible.clone(target);
					revertible.revert();
					assert.equal(sourceView.root.x, 0);
					assert.equal(targetView.root.x, 1);
					clone.revert();
					assert.equal(targetView.root.x, 0);
				} finally {
					target.dispose();
					source.dispose();
					view.dispose();
				}
			});
		}

		it("edits on the BranchCheckout do not affect the parent view", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchView = branchCheckout.viewWith(config);
			branchView.root.x = 42;
			assert.strictEqual(branchView.root.x, 42);
			assert.strictEqual(view.root.x, 0);
		});

		it("a BranchCheckout can be merged back into the parent view", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchView = branchCheckout.viewWith(config);
			branchView.root.x = 7;
			view.merge(branchView);
			assert.strictEqual(view.root.x, 7);
		});
	});

	describe("disposal", () => {
		it("disposing the parent view does not dispose the BranchCheckout", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			view.dispose();
			assert.strictEqual(branchCheckout.disposed, false);
		});

		it("disposing the BranchCheckout does not affect the parent view", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			branchCheckout.dispose();
			assert.strictEqual(branchCheckout.disposed, true);
			assert.strictEqual(view.checkout.disposed, false);
			assert.strictEqual(view.root.x, 0);
		});

		it("merge auto-disposes the merged BranchCheckout", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchView = branchCheckout.viewWith(config);
			branchView.root.x = 9;
			view.merge(branchView);
			assert.strictEqual(branchCheckout.disposed, true);
		});

		it("disposing a view does not dispose the BranchCheckout and permits recreating the view", () => {
			const view = makeView();
			const branch = forkAsBranchCheckout(view.checkout);
			const v1 = branch.viewWith(config);
			v1.root.x = 3;
			v1.dispose();
			assert.strictEqual(branch.disposed, false);
			const v2 = branch.viewWith(config);
			assert.strictEqual(v2.root.x, 3);
		});
	});

	describe("SharedTree-backed lifecycle", () => {
		it("updates cached history lengths when shared ancestry is trimmed, including child forks", () => {
			const provider = new TestTreeProviderLite(2);
			const view = provider.trees[0].kernel.viewWith(config);
			view.initialize({ x: 0 });
			provider.synchronizeMessages();
			const peer = provider.trees[1].kernel.viewWith(config);
			for (let i = 1; i <= 10; i++) {
				view.root.x = i;
			}
			provider.synchronizeMessages();

			const branch = forkAsBranchCheckout(view.checkout);
			const child = branch.fork();
			try {
				const initialLength = branch.mainBranch.getCommitCount();
				assert.equal(branch.branchHistory.length, initialLength);
				assert.equal(child.branchHistory.length, initialLength);

				view.root.x = 11;
				peer.root.x = 12;
				provider.synchronizeMessages();

				const trimmedLength = branch.mainBranch.getCommitCount();
				assert(trimmedLength < initialLength, "Expected shared ancestry to be trimmed.");
				assert.equal(branch.branchHistory.length, trimmedLength);
				assert.equal(child.mainBranch.getCommitCount(), trimmedLength);
				assert.equal(child.branchHistory.length, trimmedLength);

				const freshChild = branch.fork();
				try {
					assert.equal(freshChild.mainBranch.getHead(), child.mainBranch.getHead());
					assert.equal(freshChild.branchHistory.length, child.branchHistory.length);
				} finally {
					freshChild.dispose();
				}
			} finally {
				child.dispose();
				branch.dispose();
				peer.dispose();
				view.dispose();
			}
		});

		function makeSharedView() {
			const provider = new TestTreeProviderLite();
			const view = provider.trees[0].kernel.viewWith(config);
			view.initialize({ x: 0 });
			provider.synchronizeMessages();
			return view;
		}

		it("disposing a forked branch view prevents its edits from being merged", () => {
			const view = makeSharedView();
			const branch = forkAsBranchCheckout(view.checkout);
			const branchView = branch.viewWith(config);
			const child = branchView.fork();
			child.root.x = 7;
			child.dispose();

			assert.throws(
				() => branch.merge(child),
				validateUsageError(
					"The source branch of the merge has been disposed and cannot be merged.",
				),
			);
			assert.equal(branchView.root.x, 0);
			branch.dispose();
			view.dispose();
		});

		it("rejecting rewind through a branch view leaves the branch usable", () => {
			const view = makeSharedView();
			const branch = forkAsBranchCheckout(view.checkout);
			const branchView = branch.viewWith(config);
			const revision = branch.branchHistory.getHead()?.revision;
			assert(revision !== undefined);
			branchView.root.x = 1;
			const head = branch.branchHistory.getHead()?.revision;

			assert.throws(
				() => branchView.rewindTo(revision),
				validateUsageError(/Rewinding is not supported on a branch/),
			);
			assert.equal(branch.branchHistory.getHead()?.revision, head);
			assert.equal(branchView.root.x, 1);
			branchView.root.x = 2;
			view.merge(branch);
			assert.equal(view.root.x, 2);
			view.dispose();
		});
	});
});

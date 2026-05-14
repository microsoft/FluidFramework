/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	BranchCheckout,
	TreeCheckout,
	forkAsBranchCheckout,
	getBranch,
	getBranchCheckout,
	getViewOfBranch,
} from "../../shared-tree/index.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { getView } from "../utils.js";

const enableSchemaValidation = true;

describe("BranchCheckout", () => {
	const schemaFactory = new SchemaFactory("BranchCheckout test schema");
	const Root = schemaFactory.object("Root", { x: schemaFactory.number });
	const config = new TreeViewConfiguration({ enableSchemaValidation, schema: Root });

	function makeView() {
		const view = getView(config);
		view.initialize({ x: 0 });
		return view;
	}

	describe("construction", () => {
		it("returns a BranchCheckout that is also a TreeCheckout", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.ok(branchCheckout instanceof BranchCheckout);
			assert.ok(branchCheckout instanceof TreeCheckout);
		});

		it("the forked checkout is independent from the parent", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.notStrictEqual(branchCheckout, view.checkout);
			assert.notStrictEqual(branchCheckout.forest, view.checkout.forest);
			assert.notStrictEqual(branchCheckout.storedSchema, view.checkout.storedSchema);
		});

		it("registers the new BranchCheckout in the canonical map", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.strictEqual(getBranchCheckout(branchCheckout.mainBranch), branchCheckout);
		});

		it("isSharedBranch is false", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.strictEqual(branchCheckout.isSharedBranch, false);
		});

		it("rejects construction over a shared branch", () => {
			// The constructor's only invariant is `!isSharedBranch`. The assert fires before super()
			// runs, so the remaining params are unreachable — `as never` reflects that intent without
			// requiring real values.
			assert.throws(
				() =>
					new BranchCheckout(
						undefined as never,
						true,
						undefined as never,
						undefined as never,
						undefined as never,
						undefined as never,
						undefined as never,
						undefined as never,
					),
				/BranchCheckout cannot represent a shared branch/,
			);
		});

		it("forkAsBranchCheckout throws if the parent is in a broken state", () => {
			// Regression guard: forkWith must apply the broken-state check, even though the
			// `BranchCheckout.fork` override (and `forkAsBranchCheckout`) bypass `TreeCheckout.fork`.
			const view = makeView();
			assert.throws(() => view.checkout.breaker.break(new Error("broken parent")));
			assert.throws(
				() => forkAsBranchCheckout(view.checkout),
				validateUsageError(/broken parent/),
			);
		});

		it("inherits disposeForksAfterTransaction from the parent", () => {
			// `forkWith` propagates the parent's flag verbatim; without per-call configuration,
			// the strongest invariant we can assert is structural equality with the parent's value.
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			assert.strictEqual(
				branchCheckout.disposeForksAfterTransaction,
				view.checkout.disposeForksAfterTransaction,
			);
			// And it survives one more hop through `forkWith`:
			const grandchild = branchCheckout.fork();
			assert.strictEqual(
				grandchild.disposeForksAfterTransaction,
				view.checkout.disposeForksAfterTransaction,
			);
		});
	});

	describe("viewless", () => {
		it("can materialize a view on demand via getViewOfBranch", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchView = getViewOfBranch(branchCheckout, config);
			assert.strictEqual(branchView.root.x, 0);
		});

		it("each forkAsBranchCheckout has its own forest, so each can be viewed independently", () => {
			const view = makeView();
			const a = forkAsBranchCheckout(view.checkout);
			const b = forkAsBranchCheckout(view.checkout);
			const viewA = getViewOfBranch(a, config);
			const viewB = getViewOfBranch(b, config);
			assert.notStrictEqual(a.forest, b.forest);
			viewA.root.x = 1;
			viewB.root.x = 2;
			assert.strictEqual(viewA.root.x, 1);
			assert.strictEqual(viewB.root.x, 2);
		});
	});

	describe("permanently bound to its branch", () => {
		it("switchBranch throws regardless of which branch is passed", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			// The override preserves the base signature for LSP compatibility but ignores the arg.
			// Pass the BranchCheckout's own branch — any value should produce the same UsageError.
			assert.throws(
				() => branchCheckout.switchBranch(branchCheckout.mainBranch),
				validateUsageError(/switchBranch is not supported on BranchCheckout/),
			);
		});

		it("fork() returns another BranchCheckout (not a plain TreeCheckout)", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const forked = branchCheckout.fork();
			assert.ok(forked instanceof BranchCheckout);
			assert.strictEqual(getBranchCheckout(forked.mainBranch), forked);
		});

		it("forkAsBranchCheckout chains: forking a BranchCheckout yields an independent BranchCheckout", () => {
			// `forkAsBranchCheckout` accepts any TreeCheckout, including a BranchCheckout.
			// The resulting child must register under its own branch, not collide with the parent's
			// registry entry, and edits must remain isolated.
			const view = makeView();
			const parent = forkAsBranchCheckout(view.checkout);
			const child = forkAsBranchCheckout(parent);

			assert.ok(child instanceof BranchCheckout);
			assert.notStrictEqual(child, parent);
			assert.notStrictEqual(child.mainBranch, parent.mainBranch);
			assert.notStrictEqual(child.forest, parent.forest);

			// Both branches are registered, and lookups don't cross-contaminate.
			assert.strictEqual(getBranchCheckout(child.mainBranch), child);
			assert.strictEqual(getBranchCheckout(parent.mainBranch), parent);

			// Edits on the child are invisible to the parent (and to the original view).
			const childView = getViewOfBranch(child, config);
			childView.root.x = 11;
			const parentView = getViewOfBranch(parent, config);
			assert.strictEqual(parentView.root.x, 0);
			assert.strictEqual(view.root.x, 0);
			assert.strictEqual(childView.root.x, 11);
		});
	});

	describe("edits and merges", () => {
		it("edits on the BranchCheckout do not affect the parent view", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchView = getViewOfBranch(branchCheckout, config);
			branchView.root.x = 42;
			assert.strictEqual(branchView.root.x, 42);
			assert.strictEqual(view.root.x, 0);
		});

		it("a BranchCheckout can be merged back into the parent view", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchView = getViewOfBranch(branchCheckout, config);
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

		it("dispose removes the BranchCheckout from the canonical map", () => {
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branch = branchCheckout.mainBranch;
			assert.strictEqual(getBranchCheckout(branch), branchCheckout);
			branchCheckout.dispose();
			assert.strictEqual(getBranchCheckout(branch), undefined);
		});

		it("merge auto-dispose also removes the BranchCheckout from the canonical map", () => {
			// `TreeCheckout.merge` auto-disposes the merged checkout via `[disposeSymbol]()`,
			// not `dispose()`. The override must hook the symbol to catch this path.
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branch = branchCheckout.mainBranch;
			const branchView = getViewOfBranch(branchCheckout, config);
			branchView.root.x = 9;
			view.merge(branchView);
			assert.strictEqual(branchCheckout.disposed, true);
			assert.strictEqual(getBranchCheckout(branch), undefined);
		});
	});

	describe("getViewOfBranch", () => {
		it("returns a view bound to the given BranchCheckout", () => {
			// Two views built from the same BranchCheckout observe the same underlying state:
			// an edit on one is visible through the other.
			const view = makeView();
			const branchCheckout = forkAsBranchCheckout(view.checkout);
			const branchViewA = getViewOfBranch(branchCheckout, config);
			branchViewA.root.x = 99;
			branchViewA.dispose();
			const branchViewB = getViewOfBranch(branchCheckout, config);
			assert.strictEqual(branchViewB.root.x, 99);
			// And the parent view is unaffected.
			assert.strictEqual(view.root.x, 0);
		});

		it("throws when passed a non-BranchCheckout TreeCheckout", () => {
			// `getViewOfBranch` asserts that the branch is a `BranchCheckout`; passing the main
			// (non-branch) checkout — which is a plain `TreeCheckout` — should fail fast.
			const view = makeView();
			assert.throws(() => getViewOfBranch(view.checkout, config));
		});
	});

	describe("getBranch", () => {
		it("lazily forks a new BranchCheckout when none is registered for the view", () => {
			// A fresh view has no BranchCheckout registered for its mainBranch — `getBranch` must
			// create one via `forkAsBranchCheckout` and register it in the canonical map.
			const view = makeView();
			assert.strictEqual(getBranchCheckout(view.checkout.mainBranch), undefined);
			const branch = getBranch(view);
			assert.ok(branch instanceof BranchCheckout);
			// The new branch is registered under its own mainBranch, not the parent view's.
			assert.strictEqual(getBranchCheckout(branch.mainBranch), branch);
			// Edits on the new branch don't bleed into the parent view (proves it's a fork, not the parent itself).
			const branchView = getViewOfBranch(branch, config);
			branchView.root.x = 5;
			assert.strictEqual(branchView.root.x, 5);
			assert.strictEqual(view.root.x, 0);
		});

		it("returns the existing BranchCheckout when one is already registered", () => {
			// If a BranchCheckout was previously created over the view's mainBranch, `getBranch`
			// must return that same instance rather than forking another one.
			const view = makeView();
			const registeredBranch = forkAsBranchCheckout(view.checkout);
			// `forkAsBranchCheckout` creates a *child* BranchCheckout — its mainBranch is the child branch,
			// not the parent view's. To exercise the cached path, look up the branch via its own view.
			const childView = getViewOfBranch(registeredBranch, config);
			assert.strictEqual(getBranch(childView), registeredBranch);
		});

		it("throws when passed a non-SchematizingSimpleTreeView", () => {
			// `getBranch` asserts that the view is a `SchematizingSimpleTreeView`; any other
			// `TreeViewAlpha` implementation must fail fast.
			assert.throws(() =>
				// Cast away types to feed an unrelated object — the runtime assert is what we're testing.
				getBranch({} as unknown as Parameters<typeof getBranch>[0]),
			);
		});

		it("returns the same TreeBranchAlpha across repeated calls on a fresh view", () => {
			// Idempotence: once `getBranch` has lazy-forked a `BranchCheckout` for a view, the next
			// call on the same view must return the same instance — even though the view's
			// `mainBranch` itself was never registered in the canonical map.
			const view = makeView();
			const first = getBranch(view);
			const second = getBranch(view);
			assert.strictEqual(first, second);
		});

		it("forks a fresh BranchCheckout if the previously cached one was disposed", () => {
			// Disposal of the cached fork must not pin a dead instance; the next call should
			// recover by minting a new BranchCheckout.
			const view = makeView();
			const first = getBranch(view);
			assert.ok(first instanceof BranchCheckout);
			first.dispose();
			const second = getBranch(view);
			assert.notStrictEqual(second, first);
			assert.ok(second instanceof BranchCheckout);
			assert.strictEqual(second.disposed, false);
		});

		it("the new BranchCheckout after merge auto-dispose starts from the post-merge state", () => {
			// Regression guard: after a merge that auto-disposes the cached BranchCheckout, the
			// next `getBranch` call must lazy-fork from the *current* checkout state, not from a
			// stale snapshot.
			const view = makeView();
			const branch1 = getBranch(view);
			const branch1View = getViewOfBranch(branch1, config);
			branch1View.root.x = 7;
			view.merge(branch1View);
			assert.strictEqual(view.root.x, 7);
			assert.strictEqual(branch1.disposed, true);
			const branch2 = getBranch(view);
			assert.notStrictEqual(branch2, branch1);
			const branch2View = getViewOfBranch(branch2, config);
			assert.strictEqual(branch2View.root.x, 7);
		});
	});

	describe("getViewOfBranch lifecycle", () => {
		it("disposing a view created via getViewOfBranch does not dispose the BranchCheckout", () => {
			// Regression guard: a BranchCheckout may have multiple views created over its lifetime,
			// so disposing one view must not tear down the underlying branch (the default 1:1
			// view/checkout auto-dispose contract is opt-out for BranchCheckout via `disposeWithView`).
			const view = makeView();
			const branch = forkAsBranchCheckout(view.checkout);
			const v1 = getViewOfBranch(branch, config);
			v1.root.x = 3;
			v1.dispose();
			assert.strictEqual(branch.disposed, false);
			// And a second view sees the prior edits.
			const v2 = getViewOfBranch(branch, config);
			assert.strictEqual(v2.root.x, 3);
		});
	});
});

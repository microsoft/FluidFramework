/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

/* eslint-disable import-x/no-internal-modules */
import {
	DocumentRootParent,
	RemovedRootParent,
	UnhydratedParent,
} from "../../shared-tree/parentObject.js";
import { TreeAlpha } from "../../shared-tree/treeAlpha.js";
/* eslint-enable import-x/no-internal-modules */
import {
	SchemaFactory,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "../../simple-tree/index.js";
import { createTestUndoRedoStacks, getView } from "../utils.js";

/**
 * Class-level unit tests for {@link DocumentRootParent}, {@link RemovedRootParent}, and
 * {@link UnhydratedParent} (the concrete {@link ParentObject} implementations).
 *
 * @remarks
 * These exercise the classes directly (their `getChild`/`getChildren` methods, the per-instance
 * caching done by `getOrCreate`, and the input asserts). End-to-end coverage of the public
 * `TreeAlpha.parent2`/`child`/`children`/`on` surface lives in `tree.spec.ts`; instances here are
 * still obtained via `TreeAlpha.parent2` because the constructors are private.
 */
describe("parentObject", () => {
	// Scoped to avoid colliding with identically-named schema in other test files.
	const sf = new SchemaFactory("com.fluidframework.test.parentObject");
	class ChildNode extends sf.object("ChildNode", { value: sf.number }) {}
	class Container extends sf.object("Container", { items: sf.array(ChildNode) }) {}

	describe("DocumentRootParent", () => {
		it("getChild(undefined) returns the root node", () => {
			const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
			view.initialize({ value: 1 });
			const root = view.root;

			const parent = TreeAlpha.parent2(root);
			assert(parent instanceof DocumentRootParent);
			assert.equal(parent.getChild(undefined), root);
		});

		it("getChild(undefined) returns a leaf value when the root is a leaf", () => {
			const view = getView(
				new TreeViewConfigurationAlpha({ schema: sf.optional([ChildNode, sf.number]) }),
			);
			view.initialize({ value: 1 });
			const root = view.root;
			assert(root instanceof ChildNode);

			const parent = TreeAlpha.parent2(root);
			assert(parent instanceof DocumentRootParent);

			// Replace the node root with a leaf value: getChild should return that value.
			view.root = 5;
			assert.equal(parent.getChild(undefined), 5);
		});

		it("getChild(undefined) returns undefined for an empty optional root", () => {
			const view = getView(new TreeViewConfigurationAlpha({ schema: sf.optional(ChildNode) }));
			view.initialize({ value: 1 });
			const root = view.root;
			assert(root !== undefined);

			const parent = TreeAlpha.parent2(root);
			assert(parent instanceof DocumentRootParent);

			view.root = undefined;
			assert.equal(parent.getChild(undefined), undefined);
		});

		it("getChild with a non-undefined key asserts", () => {
			const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
			view.initialize({ value: 1 });

			const parent = TreeAlpha.parent2(view.root);
			assert(parent instanceof DocumentRootParent);
			assert.throws(() => parent.getChild("foo"));
			assert.throws(() => parent.getChild(0));
		});

		it("getChildren yields a single [undefined, root] pair", () => {
			const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
			view.initialize({ value: 1 });
			const root = view.root;

			const parent = TreeAlpha.parent2(root);
			assert(parent instanceof DocumentRootParent);
			assert.deepEqual([...parent.getChildren()], [[undefined, root]]);
		});

		it("getChildren is empty for an empty optional root", () => {
			const view = getView(new TreeViewConfigurationAlpha({ schema: sf.optional(ChildNode) }));
			view.initialize({ value: 1 });
			const root = view.root;
			assert(root !== undefined);

			const parent = TreeAlpha.parent2(root);
			assert(parent instanceof DocumentRootParent);

			view.root = undefined;
			assert.deepEqual([...parent.getChildren()], []);
		});

		it("is cached per branch (same instance regardless of root node)", () => {
			const view = getView(new TreeViewConfigurationAlpha({ schema: sf.optional(ChildNode) }));
			view.initialize({ value: 1 });
			const root = view.root;
			assert(root !== undefined);

			const parent = TreeAlpha.parent2(root);
			assert(parent instanceof DocumentRootParent);
			// Same node queried twice returns the same instance.
			assert.equal(TreeAlpha.parent2(root), parent);

			// After replacing the root, the new root maps to the same (branch-keyed) instance.
			view.root = new ChildNode({ value: 2 });
			const newRoot = view.root;
			assert(newRoot !== undefined);
			assert.equal(TreeAlpha.parent2(newRoot), parent);
		});
	});

	describe("RemovedRootParent", () => {
		it("getChild(undefined) returns the removed node", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });
			const item = view.root.items[0];
			view.root.items.removeAt(0);

			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof RemovedRootParent);
			assert.equal(parent.getChild(undefined), item);
		});

		it("getChild with a non-undefined key asserts", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });
			const item = view.root.items[0];
			view.root.items.removeAt(0);

			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof RemovedRootParent);
			assert.throws(() => parent.getChild("foo"));
			assert.throws(() => parent.getChild(0));
		});

		it("getChildren yields a single [undefined, removedNode] pair", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });
			const item = view.root.items[0];
			view.root.items.removeAt(0);

			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof RemovedRootParent);
			assert.deepEqual([...parent.getChildren()], [[undefined, item]]);
		});

		it("is cached per detached node", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });
			const item = view.root.items[0];
			view.root.items.removeAt(0);

			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof RemovedRootParent);
			assert.equal(TreeAlpha.parent2(item), parent);
		});

		it("replaces the stale cache entry when the node is removed into a new detached field", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });
			const undoRedoStacks = createTestUndoRedoStacks(view.events);

			const item = view.root.items[0];

			// First removal: get the RemovedRootParent for this detached field.
			view.root.items.removeAt(0);
			const firstParent = TreeAlpha.parent2(item);
			assert(firstParent instanceof RemovedRootParent);

			// Re-attach via undo, then remove again. The second removal puts the node in a *new*
			// detached field, so the cached (stale) parent must be replaced with a fresh instance.
			undoRedoStacks.undoStack.pop()?.revert();
			view.root.items.removeAt(0);
			const secondParent = TreeAlpha.parent2(item);
			assert(secondParent instanceof RemovedRootParent);

			assert.notEqual(secondParent, firstParent);

			undoRedoStacks.unsubscribe();
		});
	});

	describe("UnhydratedParent", () => {
		it("getChild(undefined) returns the unhydrated node", () => {
			const item = new ChildNode({ value: 1 });
			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof UnhydratedParent);
			assert.equal(parent.getChild(undefined), item);
		});

		it("getChild with a non-undefined key asserts", () => {
			const item = new ChildNode({ value: 1 });
			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof UnhydratedParent);
			assert.throws(() => parent.getChild("foo"));
			assert.throws(() => parent.getChild(0));
		});

		it("getChildren yields a single [undefined, node] pair", () => {
			const item = new ChildNode({ value: 1 });
			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof UnhydratedParent);
			assert.deepEqual([...parent.getChildren()], [[undefined, item]]);
		});

		it("is cached per unhydrated node", () => {
			const item = new ChildNode({ value: 1 });
			const parent = TreeAlpha.parent2(item);
			assert(parent instanceof UnhydratedParent);
			assert.equal(TreeAlpha.parent2(item), parent);
		});
	});
});

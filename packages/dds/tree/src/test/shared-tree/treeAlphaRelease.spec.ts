/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { ContextSlot, flexTreeSlot, TreeStatus } from "../../feature-libraries/index.js";
import {
	type SchematizingSimpleTreeView,
	Tree,
	TreeAlpha,
	TreeBeta,
} from "../../shared-tree/index.js";
import { getKernel, SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { simpleTreeNodeSlot } from "../../simple-tree/core/treeNodeKernel.js";
import { createTestUndoRedoStacks, getView } from "../utils.js";

const sf = new SchemaFactory("release");
class Leaf extends sf.object("Leaf", { value: sf.number }) {}
class Item extends sf.object("Item", {
	label: sf.string,
	leaves: sf.array(Leaf),
	extra: sf.optional(Leaf),
}) {}
class Root extends sf.object("Root", { items: sf.array(Item) }) {}
const config = new TreeViewConfiguration({ schema: Root });

const releasedError = validateUsageError(/released by TreeAlpha\.release/);

function createView(itemCount = 3): SchematizingSimpleTreeView<typeof Root> {
	const view = getView(config);
	view.initialize({
		items: Array.from({ length: itemCount }, (_, index) => ({
			label: `item ${index}`,
			leaves: [{ value: index }, { value: index + 0.5 }],
			extra: { value: -index },
		})),
	});
	return view;
}

/**
 * Counts the objects held for reading `view`: anchors, TreeNodes and flex tree nodes on them,
 * and the flex tree entities holding anchors or cursors.
 */
function countMaterialized(view: SchematizingSimpleTreeView<typeof Root>): {
	anchors: number;
	treeNodes: number;
	flexNodes: number;
	withAnchors: number;
	cursorHolders: number;
} {
	const anchorSet = view.checkout.forest.anchors;
	let anchors = 0;
	let treeNodes = 0;
	let flexNodes = 0;
	for (const anchorNode of anchorSet) {
		anchors++;
		if (anchorNode.slots.has(simpleTreeNodeSlot)) {
			treeNodes++;
		}
		if (anchorNode.slots.has(flexTreeSlot)) {
			flexNodes++;
		}
	}
	const context = anchorSet.slots.get(ContextSlot);
	assert(context !== undefined);
	return {
		// The anchor set's iterator includes its special root, which is not an anchor.
		anchors: anchors - 1,
		treeNodes,
		flexNodes,
		withAnchors: context.withAnchors.size,
		cursorHolders: context.cursorHolderCount,
	};
}

/**
 * Reads everything under `item`.
 */
function readItem(item: Item): string {
	return JSON.stringify([
		item.label,
		item.leaves.map((leaf) => leaf.value),
		item.extra?.value,
	]);
}

describe("TreeAlpha.release", () => {
	it("frees the objects created for reading a subtree", () => {
		const view = createView();
		const items = view.root.items;
		assert.equal(items.length, 3);
		const notRead = countMaterialized(view);

		readItem(items[0]);
		readItem(items[1]);
		const read = countMaterialized(view);
		assert(read.anchors > notRead.anchors);
		assert(read.treeNodes > notRead.treeNodes);

		TreeAlpha.release(items[0]);
		TreeAlpha.release(items[1]);
		assert.deepEqual(countMaterialized(view), notRead);
		view.dispose();
	});

	it("can release nodes while iterating over their parent", () => {
		const view = createView();
		const items = view.root.items;
		assert.equal(items.length, 3);
		const notRead = countMaterialized(view);
		const labels: string[] = [];
		for (const item of items) {
			readItem(item);
			labels.push(item.label);
			TreeAlpha.release(item);
		}
		assert.deepEqual(labels, ["item 0", "item 1", "item 2"]);
		assert.deepEqual(countMaterialized(view), notRead);
		view.dispose();
	});

	it("does not keep released nodes listed as cursor holders", () => {
		const view = createView(500);
		const context = view.checkout.forest.anchors.slots.get(ContextSlot);
		assert(context !== undefined);
		for (const item of view.root.items) {
			readItem(item);
			TreeAlpha.release(item);
		}
		// At most the list's slack of entries for released entities remains, out of the thousands released.
		assert(context.listedCursorHolderCount <= 2 * context.cursorHolderCount + 64);
		view.dispose();
	});

	it("only releases the given subtree", () => {
		const view = createView();
		const items = view.root.items;
		const first = items[0];
		const second = items[1];
		const leaf = second.leaves[0];
		readItem(first);
		TreeAlpha.release(first);
		assert.equal(items[1], second);
		assert.equal(second.leaves[0], leaf);
		assert.equal(leaf.value, 1);
		assert.equal(Tree.status(second), TreeStatus.InDocument);
		view.dispose();
	});

	it("makes released nodes unusable", () => {
		const view = createView();
		const item = view.root.items[0];
		const leaf = item.leaves[0];
		const leaves = item.leaves;
		readItem(item);
		TreeAlpha.release(item);

		for (const released of [item, leaf, leaves]) {
			assert.throws(() => Tree.status(released), releasedError);
			assert.throws(() => Tree.parent(released), releasedError);
			assert.throws(() => Tree.key(released), releasedError);
			assert.throws(() => Tree.on(released, "nodeChanged", () => {}), releasedError);
			assert.throws(() => TreeAlpha.exportVerbose(released), releasedError);
			assert.throws(() => TreeAlpha.children(released), releasedError);
			assert.throws(() => TreeBeta.clone(released), releasedError);
			assert.throws(() => JSON.stringify(released), releasedError);
			assert.throws(() => Object.keys(released), releasedError);
		}
		assert.throws(() => item.label, releasedError);
		assert.throws(() => item.extra, releasedError);
		assert.throws(() => {
			item.label = "changed";
		}, releasedError);
		assert.throws(() => leaf.value, releasedError);
		assert.throws(() => leaves.length, releasedError);
		assert.throws(() => leaves[0], releasedError);
		assert.throws(() => [...leaves], releasedError);
		assert.throws(() => leaves.insertAtEnd({ value: 1 }), releasedError);
		assert.throws(() => view.root.items.insertAtEnd(item), releasedError);

		// Schema is not tree content, so it stays available.
		assert.equal(Tree.schema(item), Item);
		assert(Tree.is(item, Item));
		assert(item instanceof Item);
		assert(leaf instanceof Leaf);
		view.dispose();
	});

	it("reading again from the parent creates new nodes which see later edits", () => {
		const view = createView();
		const items = view.root.items;
		const item = items[0];
		const before = readItem(item);
		TreeAlpha.release(item);

		const fresh = items[0];
		assert.notEqual(fresh, item);
		assert(fresh instanceof Item);
		assert.equal(readItem(fresh), before);
		assert.equal(Tree.parent(fresh), items);

		fresh.label = "edited";
		fresh.leaves.insertAtStart({ value: 42 });
		assert.equal(items[0].label, "edited");
		assert.equal(items[0].leaves[0].value, 42);

		TreeAlpha.release(fresh);
		items[0].extra = undefined;
		assert.equal(readItem(items[0]), JSON.stringify(["edited", [42, 0, 0.5], undefined]));
		view.dispose();
	});

	it("does not affect edits elsewhere or undo and redo", () => {
		const view = createView();
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
			view.checkout.events,
		);
		const items = view.root.items;
		items[0].label = "first edit";
		items[1].leaves.removeAt(0);
		readItem(items[0]);
		readItem(items[1]);
		TreeAlpha.release(items[0]);
		TreeAlpha.release(items[1]);

		items[2].label = "after release";
		assert.equal(items[2].label, "after release");

		undoStack.pop()?.revert();
		assert.equal(items[2].label, "item 2");
		undoStack.pop()?.revert();
		assert.equal(items[1].leaves.length, 2);
		TreeAlpha.release(items[0]);
		undoStack.pop()?.revert();
		assert.equal(items[0].label, "item 0");

		redoStack.pop()?.revert();
		assert.equal(items[0].label, "first edit");
		unsubscribe();
		view.dispose();
	});

	it("releases removed nodes, which undo can restore", () => {
		const view = createView();
		const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.checkout.events);
		const items = view.root.items;
		const removed = items[0];
		readItem(removed);
		items.removeAt(0);
		assert.equal(Tree.status(removed), TreeStatus.Removed);
		TreeAlpha.release(removed);
		assert.throws(() => Tree.status(removed), releasedError);

		undoStack.pop()?.revert();
		assert.notEqual(items[0], removed);
		assert.equal(items[0].label, "item 0");
		assert.equal(items.length, 3);
		unsubscribe();
		view.dispose();
	});

	it("does nothing for released and deleted nodes", () => {
		const view = createView();
		const item = view.root.items[0];
		TreeAlpha.release(item);
		TreeAlpha.release(item);

		const other = view.root.items[1];
		view.dispose();
		assert.equal(Tree.status(other), TreeStatus.Deleted);
		TreeAlpha.release(other);
	});

	it("rejects unhydrated nodes", () => {
		assert.throws(
			() => TreeAlpha.release(new Item({ label: "new", leaves: [] })),
			validateUsageError(/Only nodes in a tree can be released/),
		);
	});

	it("can release the root", () => {
		const view = createView();
		const root = view.root;
		readItem(root.items[0]);
		TreeAlpha.release(root);
		assert.throws(() => root.items, releasedError);

		const anchorSet = view.checkout.forest.anchors;
		assert(anchorSet.isEmpty());

		assert.notEqual(view.root, root);
		assert.equal(view.root.items[0].label, "item 0");
		view.root.items[0].label = "edited";
		assert.equal(view.root.items[0].label, "edited");
		view.dispose();
	});

	describe("event listeners", () => {
		it("rejects nodes with listeners on them or under them, and releases nothing", () => {
			const view = createView();
			const item = view.root.items[0];
			const leaf = item.leaves[1];
			readItem(item);
			const read = countMaterialized(view);

			const offItem = Tree.on(item, "treeChanged", () => {});
			assert.throws(() => TreeAlpha.release(item), validateUsageError(/have event listeners/));
			offItem();

			const offLeaf = TreeBeta.on(leaf, "nodeChanged", () => {});
			assert.throws(() => TreeAlpha.release(item), validateUsageError(/have event listeners/));
			assert.deepEqual(countMaterialized(view), read);
			assert.equal(leaf.value, 0.5);
			assert.equal(item.leaves[1], leaf);

			offLeaf();
			TreeAlpha.release(item);
			assert.throws(() => leaf.value, releasedError);
			view.dispose();
		});

		it("rejects nodes observed by trackObservations", () => {
			const view = createView();
			const item = view.root.items[0];
			const { unsubscribe } = TreeAlpha.trackObservations(
				() => {},
				() => item.label,
			);
			assert.throws(() => TreeAlpha.release(item), validateUsageError(/have event listeners/));
			unsubscribe();
			TreeAlpha.release(item);
			view.dispose();
		});

		it("keeps listeners on other nodes working", () => {
			const view = createView();
			const items = view.root.items;
			const other = items[1];
			let treeChanged = 0;
			let otherChanged = 0;
			const offRoot = Tree.on(view.root, "treeChanged", () => treeChanged++);
			const offOther = Tree.on(other, "nodeChanged", () => otherChanged++);
			readItem(items[0]);
			TreeAlpha.release(items[0]);

			items[0].leaves[0].value = 7;
			assert.equal(treeChanged, 1);
			other.label = "changed";
			assert.equal(treeChanged, 2);
			assert.equal(otherChanged, 1);
			offRoot();
			offOther();
			view.dispose();
		});
	});

	it("is allowed in transactions and event listeners", () => {
		const view = createView();
		const items = view.root.items;
		readItem(items[0]);
		Tree.runTransaction(view, () => {
			items[0].label = "in transaction";
			TreeAlpha.release(items[0]);
			items[0].label = "after release";
		});
		assert.equal(items[0].label, "after release");

		const second = items[1];
		readItem(second);
		const off = Tree.on(view.root, "treeChanged", () => TreeAlpha.release(second));
		items[2].label = "changed";
		off();
		assert.throws(() => second.label, releasedError);
		assert.equal(items[1].label, "item 1");
		view.dispose();
	});

	it("is not allowed while the tree is applying a change", () => {
		const view = createView();
		const items = view.root.items;
		const target = items[1];
		let releaseError: unknown;
		const anchorNode = getKernel(items[0]).anchorNode;
		assert(anchorNode !== undefined);
		const offChanging = anchorNode.events.on("childrenChanging", () => {
			try {
				TreeAlpha.release(target);
			} catch (error_: unknown) {
				releaseError = error_;
			}
		});
		items[0].label = "changed";
		offChanging();
		assert(validateUsageError(/while the tree is being changed/)(releaseError as Error));
		assert.equal(target.label, "item 1");
		view.dispose();
	});
});

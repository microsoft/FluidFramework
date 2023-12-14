/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert, fail } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { ITreeCheckout, TreeContent } from "../../shared-tree";
import { leaf, SchemaBuilder } from "../../domains";
import {
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	emptyJsonSequenceConfig,
	insert,
	jsonSequenceRootSchema,
	flexTreeViewWithContent,
	checkoutWithContent,
} from "../utils";
import {
	AllowedUpdateType,
	TreeStoredSchema,
	TreeValue,
	Value,
	moveToDetachedField,
	storedEmptyFieldSchema,
} from "../../core";
import { ContextuallyTypedNodeData } from "../../feature-libraries";

describe("sharedTreeView", () => {
	describe("Events", () => {
		const builder = new SchemaBuilder({ scope: "Events test schema" });
		const rootTreeNodeSchema = builder.object("root", {
			x: builder.number,
		});
		const schema = builder.intoSchema(builder.optional(rootTreeNodeSchema));

		it("triggers events for local and subtree changes", () => {
			const view = flexTreeViewWithContent({
				schema,
				initialTree: {
					x: 24,
				},
			});
			const root = view.editableTree.content ?? fail("missing root");
			const log: string[] = [];
			const unsubscribe = root.on("changing", () => log.push("change"));
			const unsubscribeSubtree = root.on("subtreeChanging", () => {
				log.push("subtree");
			});
			const unsubscribeAfter = view.checkout.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root.x = 5;
			log.push("editStart");
			root.x = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root.x = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree",
				"subtree",
				"change",
				"after",
				"editStart",
				"subtree",
				"subtree",
				"change",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});

		it("propagates path args for local and subtree changes", () => {
			const view = flexTreeViewWithContent({
				schema,
				initialTree: {
					x: 24,
				},
			});
			const root = view.editableTree.content ?? fail("missing root");
			const log: string[] = [];
			const unsubscribe = root.on("changing", (upPath) =>
				log.push(`change-${String(upPath.parentField)}-${upPath.parentIndex}`),
			);
			const unsubscribeSubtree = root.on("subtreeChanging", (upPath) => {
				log.push(`subtree-${String(upPath.parentField)}-${upPath.parentIndex}`);
			});
			const unsubscribeAfter = view.checkout.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root.x = 5;
			log.push("editStart");
			root.x = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root.x = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree-rootFieldKey-0",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"after",
				"editStart",
				"subtree-rootFieldKey-0",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});

		// TODO: unskip once forking revertibles is supported
		it.skip("triggers a revertible event for a changes merged into the local branch", () => {
			const tree1 = checkoutWithContent({
				schema: jsonSequenceRootSchema,
				initialTree: [],
			});
			const branch = tree1.fork();

			const { undoStack: undoStack1, unsubscribe: unsubscribe1 } = createTestUndoRedoStacks(
				tree1.events,
			);
			const { undoStack: undoStack2, unsubscribe: unsubscribe2 } = createTestUndoRedoStacks(
				branch.events,
			);

			// Insert node
			insertFirstNode(branch, "42");

			assert.equal(undoStack1.length, 0);
			assert.equal(undoStack2.length, 1);

			tree1.merge(branch);
			assert.equal(undoStack1.length, 1);
			assert.equal(undoStack2.length, 1);

			unsubscribe1();
			unsubscribe2();
		});
	});

	describe("Views", () => {
		itView("can fork and apply edits without affecting the parent", (parent) => {
			insertFirstNode(parent, "parent");
			const child = parent.fork();
			insertFirstNode(child, "child");
			assert.equal(getTestValue(parent), "parent");
			assert.deepEqual(getTestValues(child), ["parent", "child"]);
		});

		itView("can apply edits without affecting a fork", (parent) => {
			const child = parent.fork();
			assert.equal(getTestValue(parent), undefined);
			assert.equal(getTestValue(child), undefined);
			insertFirstNode(parent, "root");
			assert.equal(getTestValue(parent), "root");
			assert.equal(getTestValue(child), undefined);
		});

		itView("can merge changes into a parent", (parent) => {
			const child = parent.fork();
			insertFirstNode(child, "view");
			parent.merge(child);
			assert.equal(getTestValue(parent), "view");
		});

		itView("can rebase over a parent view", (parent) => {
			const child = parent.fork();
			insertFirstNode(parent, "root");
			assert.equal(getTestValue(child), undefined);
			child.rebaseOnto(parent);
			assert.equal(getTestValue(child), "root");
		});

		itView("can rebase over a child view", (view) => {
			const parent = view.fork();
			insertFirstNode(parent, "P1");
			const child = parent.fork();
			insertFirstNode(parent, "P2");
			insertFirstNode(child, "C1");
			parent.rebaseOnto(child);
			assert.deepEqual(getTestValues(child), ["P1", "C1"]);
			assert.deepEqual(getTestValues(parent), ["P1", "C1", "P2"]);
		});

		itView("merge changes through multiple views", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			insertFirstNode(viewD, "view");
			viewC.merge(viewD);
			assert.equal(getTestValue(viewB), undefined);
			assert.equal(getTestValue(viewC), "view");
			viewB.merge(viewC);
			assert.equal(getTestValue(viewB), "view");
			assert.equal(getTestValue(viewC), "view");
		});

		itView("merge correctly when multiple ancestors are mutated", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			insertFirstNode(viewB, "B");
			insertFirstNode(viewC, "C");
			insertFirstNode(viewD, "D");
			viewC.merge(viewD);
			assert.equal(getTestValue(viewB), "B");
			assert.equal(getTestValue(viewC), "D");
			viewB.merge(viewC);
			assert.equal(getTestValue(viewB), "D");
		});

		itView("can merge a parent view into a child", (view) => {
			const parent = view.fork();
			insertFirstNode(parent, "P1");
			const child = parent.fork();
			insertFirstNode(parent, "P2");
			insertFirstNode(child, "C1");
			child.merge(parent);
			assert.deepEqual(getTestValues(child), ["P1", "C1", "P2"]);
			assert.deepEqual(getTestValues(parent), ["P1", "P2"]);
		});

		itView("can perform a complicated merge scenario", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			insertFirstNode(viewB, "A1");
			insertFirstNode(viewC, "B1");
			insertFirstNode(viewD, "C1");
			viewC.merge(viewD);
			insertFirstNode(viewA, "R1");
			insertFirstNode(viewB, "A2");
			insertFirstNode(viewC, "B2");
			viewB.merge(viewC);
			const viewE = viewB.fork();
			insertFirstNode(viewB, "A3");
			viewE.rebaseOnto(viewB);
			assert.equal(getTestValue(viewE), "A3");
			insertFirstNode(viewB, "A4");
			insertFirstNode(viewE, "D1");
			insertFirstNode(viewA, "R2");
			viewB.merge(viewE);
			viewA.merge(viewB);
			insertFirstNode(viewA, "R3");
			assert.deepEqual(getTestValues(viewA), [
				"R1",
				"R2",
				"A1",
				"A2",
				"B1",
				"C1",
				"B2",
				"A3",
				"A4",
				"D1",
				"R3",
			]);
		});

		itView("update anchors after applying a change", (view) => {
			insertFirstNode(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			insertFirstNode(view, "B");
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging into a parent", (parent) => {
			insertFirstNode(parent, "A");
			let cursor = parent.forest.allocateCursor();
			moveToDetachedField(parent.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = parent.fork();
			insertFirstNode(child, "B");
			parent.merge(child);
			cursor = parent.forest.allocateCursor();
			parent.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging a branch into a divergent parent", (parent) => {
			insertFirstNode(parent, "A");
			let cursor = parent.forest.allocateCursor();
			moveToDetachedField(parent.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = parent.fork();
			insertFirstNode(parent, "P");
			insertFirstNode(child, "B");
			parent.merge(child);
			cursor = parent.forest.allocateCursor();
			parent.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after undoing", (view) => {
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			insertFirstNode(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			insertFirstNode(view, "B");
			undoStack.pop()?.revert();
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
			unsubscribe();
		});

		itView("can be mutated after merging", (parent) => {
			const child = parent.fork();
			insertFirstNode(child, "A");
			parent.merge(child, false);
			insertFirstNode(child, "B");
			assert.deepEqual(getTestValues(parent), ["A"]);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
			parent.merge(child);
			assert.deepEqual(getTestValues(parent), ["A", "B"]);
		});

		itView("can rebase after merging", (parent) => {
			const child = parent.fork();
			insertFirstNode(child, "A");
			parent.merge(child, false);
			insertFirstNode(parent, "B");
			child.rebaseOnto(parent);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
		});

		itView("can be read after merging", (parent) => {
			insertFirstNode(parent, "root");
			const child = parent.fork();
			parent.merge(child);
			assert.equal(getTestValue(child), "root");
		});

		itView("properly fork the tree schema", (parent) => {
			const schemaA: TreeStoredSchema = {
				nodeSchema: new Map([]),
				rootFieldSchema: storedEmptyFieldSchema,
			};
			const schemaB: TreeStoredSchema = {
				nodeSchema: new Map([[leaf.number.name, leaf.number.stored]]),
				rootFieldSchema: storedEmptyFieldSchema,
			};
			function getSchema(t: ITreeCheckout): "schemaA" | "schemaB" {
				return t.storedSchema.nodeSchema.size === 0 ? "schemaA" : "schemaB";
			}

			parent.storedSchema.update(schemaA);
			assert.equal(getSchema(parent), "schemaA");
			const child = parent.fork();
			child.storedSchema.update(schemaB);
			assert.equal(getSchema(parent), "schemaA");
			assert.equal(getSchema(child), "schemaB");
		});

		it("submit edits to Fluid when merging into the root view", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematizeInternal(emptyJsonSequenceConfig).checkout;
			provider.processMessages();
			const tree2 = provider.trees[1].schematizeInternal(emptyJsonSequenceConfig).checkout;
			provider.processMessages();
			const baseView = tree1.fork();
			const view = baseView.fork();
			// Modify the view, but tree2 should remain unchanged until the edit merges all the way up
			insertFirstNode(view, "42");
			provider.processMessages();
			assert.equal(getTestValue(tree2), undefined);
			baseView.merge(view);
			provider.processMessages();
			assert.equal(getTestValue(tree2), undefined);
			tree1.merge(baseView);
			provider.processMessages();
			assert.equal(getTestValue(tree2), "42");
		});

		it("do not squash commits", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematizeInternal(emptyJsonSequenceConfig).checkout;
			provider.processMessages();
			const tree2 = provider.trees[1];
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			const baseView = tree1.fork();
			const view = baseView.fork();
			insertFirstNode(view, "A");
			insertFirstNode(view, "B");
			baseView.merge(view);
			tree1.merge(baseView);
			provider.processMessages();
			assert.equal(opsReceived, 2);
		});
	});

	describe("Transactions", () => {
		itView("update the tree while open", (view) => {
			view.transaction.start();
			insertFirstNode(view, 42);
			assert.equal(getTestValue(view), 42);
		});

		itView("update the tree after committing", (view) => {
			view.transaction.start();
			insertFirstNode(view, 42);
			view.transaction.commit();
			assert.equal(getTestValue(view), 42);
		});

		itView("revert the tree after aborting", (view) => {
			view.transaction.start();
			insertFirstNode(view, 42);
			view.transaction.abort();
			assert.equal(getTestValue(view), undefined);
		});

		itView("can nest", (view) => {
			view.transaction.start();
			insertFirstNode(view, "A");
			view.transaction.start();
			insertFirstNode(view, "B");
			assert.deepEqual(getTestValues(view), ["A", "B"]);
			view.transaction.commit();
			assert.deepEqual(getTestValues(view), ["A", "B"]);
			view.transaction.commit();
			assert.deepEqual(getTestValues(view), ["A", "B"]);
		});

		itView("can span a view fork and merge", (view) => {
			view.transaction.start();
			const fork = view.fork();
			insertFirstNode(fork, 42);
			assert.throws(
				() => view.merge(fork, false),
				(e: Error) =>
					validateAssertionError(
						e,
						"A view that is merged into an in-progress transaction must be disposed",
					),
			);
			view.merge(fork, true);
			view.transaction.commit();
			assert.equal(getTestValue(view), 42);
		});

		itView("automatically commit if in progress when view merges", (view) => {
			const fork = view.fork();
			fork.transaction.start();
			insertFirstNode(fork, 42);
			insertFirstNode(fork, 43);
			view.merge(fork, false);
			assert.deepEqual(getTestValues(fork), [42, 43]);
			assert.equal(fork.transaction.inProgress(), false);
		});

		itView("do not close across forks", (view) => {
			view.transaction.start();
			const fork = view.fork();
			assert.throws(
				() => fork.transaction.commit(),
				(e: Error) => validateAssertionError(e, "No transaction is currently in progress"),
			);
		});

		itView("do not affect pre-existing forks", (view) => {
			const fork = view.fork();
			insertFirstNode(view, "A");
			fork.transaction.start();
			insertFirstNode(view, "B");
			fork.transaction.abort();
			insertFirstNode(view, "C");
			view.merge(fork);
			assert.deepEqual(getTestValues(view), ["A", "B", "C"]);
		});

		itView("can handle a pull while in progress", (view) => {
			const fork = view.fork();
			fork.transaction.start();
			insertFirstNode(view, 42);
			fork.rebaseOnto(view);
			assert.equal(getTestValue(fork), 42);
			fork.transaction.commit();
			assert.equal(getTestValue(fork), 42);
		});

		itView("update anchors correctly", (view) => {
			insertFirstNode(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			insertFirstNode(view, "B");
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("can handle a complicated scenario", (view) => {
			insertFirstNode(view, "A");
			view.transaction.start();
			insertFirstNode(view, "B");
			insertFirstNode(view, "C");
			view.transaction.start();
			insertFirstNode(view, "D");
			const fork = view.fork();
			insertFirstNode(fork, "E");
			fork.transaction.start();
			insertFirstNode(fork, "F");
			insertFirstNode(view, "G");
			fork.transaction.commit();
			insertFirstNode(fork, "H");
			fork.transaction.start();
			insertFirstNode(fork, "I");
			fork.transaction.abort();
			view.merge(fork);
			insertFirstNode(view, "J");
			view.transaction.start();
			const fork2 = view.fork();
			insertFirstNode(fork2, "K");
			insertFirstNode(fork2, "L");
			view.merge(fork2);
			view.transaction.abort();
			insertFirstNode(view, "M");
			view.transaction.commit();
			insertFirstNode(view, "N");
			view.transaction.commit();
			insertFirstNode(view, "O");
			assert.deepEqual(getTestValues(view), [
				"A",
				"B",
				"C",
				"D",
				"G",
				"E",
				"F",
				"H",
				"J",
				"M",
				"N",
				"O",
			]);
		});
	});
});

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function insertFirstNode(branch: ITreeCheckout, value: ContextuallyTypedNodeData): void {
	insert(branch, 0, value);
}

/**
 * Reads the last value added by {@link insertFirstNode} if it exists.
 */
function getTestValue({ forest }: ITreeCheckout): TreeValue | undefined {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	if (!readCursor.firstNode()) {
		readCursor.free();
		return undefined;
	}
	const { value } = readCursor;
	readCursor.free();
	return value;
}

/**
 * Reads all values in a tree set by {@link insertFirstNode} in the order they were added (which is the reverse of the tree order).
 */
function getTestValues({ forest }: ITreeCheckout): Value[] {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	const values: Value[] = [];
	if (readCursor.firstNode()) {
		values.unshift(readCursor.value);
		while (readCursor.nextNode()) {
			values.unshift(readCursor.value);
		}
	}
	readCursor.free();
	return values;
}

/**
 * Runs the given test function as two tests,
 * one where `view` is the root SharedTree view and the other where `view` is a fork.
 * This is useful for testing because both `SharedTree` and `SharedTreeFork` implement `ISharedTreeView` in different ways.
 *
 * TODO: users of this are making schema: one has been provided that might be close, but likely isn't fully correct..
 * TODO: users of this doesn't depend on SharedTree directly and should be moved to tests of SharedTreeView.
 */
function itView(title: string, fn: (view: ITreeCheckout) => void): void {
	const content: TreeContent = {
		schema: jsonSequenceRootSchema,
		initialTree: [],
	};
	const config = {
		...content,
		allowedSchemaModifications: AllowedUpdateType.None,
	};
	it(`${title} (root view)`, () => {
		const provider = new TestTreeProviderLite();
		// Test an actual SharedTree.
		fn(provider.trees[0].schematizeInternal(config).checkout);
	});

	it(`${title} (reference view)`, () => {
		fn(checkoutWithContent(content));
	});

	it(`${title} (forked view)`, () => {
		const provider = new TestTreeProviderLite();
		fn(provider.trees[0].schematizeInternal(config).checkout.fork());
	});

	it(`${title} (reference forked view)`, () => {
		fn(checkoutWithContent(content).fork());
	});
}

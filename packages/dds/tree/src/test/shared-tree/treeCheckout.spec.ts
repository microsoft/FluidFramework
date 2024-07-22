/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import type { IMockLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	AllowedUpdateType,
	type FieldUpPath,
	type Revertible,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeValue,
	type Value,
	moveToDetachedField,
	rootFieldKey,
	storedEmptyFieldSchema,
	RevertibleStatus,
	CommitKind,
} from "../../core/index.js";
import { leaf } from "../../domains/index.js";
import {
	type ContextuallyTypedNodeData,
	FieldKinds,
	FlexFieldSchema,
	SchemaBuilderBase,
	cursorForJsonableTreeField,
	intoStoredSchema,
} from "../../feature-libraries/index.js";
import {
	TreeCheckout,
	type ITreeCheckout,
	type RevertibleFactory,
	type TreeContent,
} from "../../shared-tree/index.js";
import {
	TestTreeProviderLite,
	createCheckoutWithContent,
	createTestUndoRedoStacks,
	emptyJsonSequenceConfig,
	flexTreeViewWithContent,
	insert,
	jsonSequenceRootSchema,
	numberSequenceRootSchema,
	schematizeFlexTree,
	stringSequenceRootSchema,
	validateTreeContent,
} from "../utils.js";
import { disposeSymbol } from "../../util/index.js";

const rootField: FieldUpPath = {
	parent: undefined,
	field: rootFieldKey,
};

describe("sharedTreeView", () => {
	describe("Events", () => {
		const builder = new SchemaBuilderBase(FieldKinds.required, {
			scope: "Events test schema",
			libraries: [leaf.library],
		});
		const rootTreeNodeSchema = builder.object("root", {
			x: leaf.number,
		});
		const schema = builder.intoSchema(
			FlexFieldSchema.create(FieldKinds.optional, [rootTreeNodeSchema]),
		);

		it("triggers events for local and subtree changes", () => {
			const view = flexTreeViewWithContent({
				schema,
				initialTree: {
					x: 24,
				},
			});
			const root = view.flexTree.content ?? fail("missing root");
			const log: string[] = [];
			const unsubscribe = root.anchorNode.on("childrenChanging", () => log.push("change"));
			const unsubscribeSubtree = root.anchorNode.on("subtreeChanging", () => {
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
			const root = view.flexTree.content ?? fail("missing root");
			const log: string[] = [];
			const unsubscribe = root.anchorNode.on("childrenChanging", (upPath) =>
				log.push(`change-${String(upPath.parentField)}-${upPath.parentIndex}`),
			);
			const unsubscribeSubtree = root.anchorNode.on("subtreeChanging", (upPath) => {
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

		describe("commitApplied", () => {
			it("is fired for data and schema changes", () => {
				const provider = new TestTreeProviderLite(1);
				const checkout = provider.trees[0].checkout;

				const log: string[] = [];
				const unsubscribe = checkout.events.on("commitApplied", () =>
					log.push("commitApplied"),
				);

				assert.equal(log.length, 0);

				checkout.updateSchema(intoStoredSchema(jsonSequenceRootSchema));

				assert.equal(log.length, 1);

				checkout.editor
					.sequenceField(rootField)
					.insert(0, cursorForJsonableTreeField([{ type: leaf.string.name, value: "A" }]));

				assert.equal(log.length, 2);

				checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));

				assert.equal(log.length, 3);
				unsubscribe();
			});

			it("does not allow schema changes to be reverted", () => {
				const provider = new TestTreeProviderLite(1);
				const checkout = provider.trees[0].checkout;

				const log: string[] = [];
				const unsubscribe = checkout.events.on("commitApplied", (data, getRevertible) =>
					log.push(getRevertible === undefined ? "not-revertible" : "revertible"),
				);

				assert.deepEqual(log, []);

				checkout.updateSchema(intoStoredSchema(jsonSequenceRootSchema));
				checkout.editor
					.sequenceField(rootField)
					.insert(0, cursorForJsonableTreeField([{ type: leaf.string.name, value: "A" }]));
				checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));

				assert.deepEqual(log, ["not-revertible", "revertible", "not-revertible"]);
				unsubscribe();
			});
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

		itView(
			"properly fork the tree schema",
			(parent) => {
				const schemaB: TreeStoredSchema = {
					nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
						[leaf.number.name, leaf.number.stored],
					]),
					rootFieldSchema: storedEmptyFieldSchema,
				};
				function getSchema(t: ITreeCheckout): "schemaA" | "schemaB" {
					return t.storedSchema.rootFieldSchema.kind === FieldKinds.required.identifier
						? "schemaA"
						: "schemaB";
				}

				assert.equal(getSchema(parent), "schemaA");
				const child = parent.fork();
				child.updateSchema(schemaB);
				assert.equal(getSchema(parent), "schemaA");
				assert.equal(getSchema(child), "schemaB");
			},
			{
				initialContent: {
					schema: new SchemaBuilderBase(FieldKinds.required, {
						scope: "test",
						libraries: [leaf.library],
					}).intoSchema(leaf.boolean),
					initialTree: true,
				},
			},
		);

		it("submit edits to Fluid when merging into the root view", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = schematizeFlexTree(provider.trees[0], emptyJsonSequenceConfig).checkout;
			provider.processMessages();
			const tree2 = schematizeFlexTree(provider.trees[1], emptyJsonSequenceConfig).checkout;
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
			const tree1 = schematizeFlexTree(provider.trees[0], emptyJsonSequenceConfig).checkout;
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

		itView("rejects merges while a transaction is in progress", (view) => {
			const fork = view.fork();
			insertFirstNode(fork, 42);

			view.transaction.start();
			insertFirstNode(view, 43);
			assert.throws(
				() => view.merge(fork, true),
				(e: Error) =>
					validateAssertionError(
						e,
						"Views cannot be merged into a view while it has a pending transaction",
					),
			);
			view.transaction.commit();
			assert.equal(getTestValue(view), 43);
		});

		itView("rejects rebases while a transaction is in progress", (view) => {
			const fork = view.fork();
			insertFirstNode(view, 42);

			fork.transaction.start();
			insertFirstNode(fork, 43);
			assert.throws(
				() => fork.rebaseOnto(view),
				(e: Error) =>
					validateAssertionError(
						e,
						"A view cannot be rebased while it has a pending transaction",
					),
			);
			fork.transaction.commit();
			assert.equal(getTestValue(fork), 43);
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

		// Disabled because rebases are not supported while a transaction is in progress
		// TODO: enable once ADO#8603 is complete.
		itView(
			"can handle a pull while in progress",
			(view) => {
				const fork = view.fork();
				fork.transaction.start();
				insertFirstNode(view, 42);
				fork.rebaseOnto(view);
				assert.equal(getTestValue(fork), 42);
				fork.transaction.commit();
				assert.equal(getTestValue(fork), 42);
			},
			{ skip: true },
		);

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

		// Disabled because merges are not supported while a transaction is in progress
		// TODO: enable once ADO#8602 is complete.
		itView(
			"can handle a complicated scenario",
			(view) => {
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
			},
			{ skip: true },
		);
	});

	describe("disposal", () => {
		itView("forks can be disposed", (view) => {
			const fork = view.fork();
			fork[disposeSymbol]();
		});

		itView("disposed forks cannot be edited or double-disposed", (view) => {
			const fork = view.fork();
			fork[disposeSymbol]();

			assert.throws(() => insertFirstNode(fork, "A"));
			assert.throws(() => fork.updateSchema(intoStoredSchema(numberSequenceRootSchema)));
			assert.throws(() => fork[disposeSymbol]());
		});
	});

	it("schema edits do not cause clients to purge detached trees or revertibles", () => {
		const provider = new TestTreeProviderLite(2);
		const checkout1 = provider.trees[0].checkout;
		const checkout2 = provider.trees[1].checkout;

		checkout1.updateSchema(intoStoredSchema(jsonSequenceRootSchema));
		checkout1.editor.sequenceField(rootField).insert(
			0,
			cursorForJsonableTreeField([
				{ type: leaf.string.name, value: "A" },
				{ type: leaf.number.name, value: 1 },
				{ type: leaf.string.name, value: "B" },
				{ type: leaf.number.name, value: 2 },
			]),
		);

		provider.processMessages();
		const checkout1Revertibles = createTestUndoRedoStacks(checkout1.events);

		checkout1.editor.sequenceField(rootField).remove(0, 1); // Remove "A"
		checkout1.editor.sequenceField(rootField).remove(0, 1); // Remove 1
		checkout1Revertibles.undoStack.pop()?.revert(); // Restore 1
		provider.processMessages();

		const checkout2Revertibles = createTestUndoRedoStacks(checkout2.events);
		checkout2.editor.sequenceField(rootField).remove(1, 1); // Remove "B"
		checkout2.editor.sequenceField(rootField).remove(1, 1); // Remove 2
		checkout2Revertibles.undoStack.pop()?.revert(); // Restore 2
		provider.processMessages();

		const expectedContent = {
			schema: jsonSequenceRootSchema,
			initialTree: [1, 2],
		};
		validateTreeContent(checkout1, expectedContent);
		validateTreeContent(checkout2, expectedContent);

		assert.equal(checkout1Revertibles.undoStack.length, 1);
		assert.equal(checkout1Revertibles.redoStack.length, 1);
		assert.equal(checkout1.getRemovedRoots().length, 2);

		assert.equal(checkout2Revertibles.undoStack.length, 1);
		assert.equal(checkout2Revertibles.redoStack.length, 1);
		assert.equal(checkout2.getRemovedRoots().length, 2);

		checkout1.updateSchema(intoStoredSchema(numberSequenceRootSchema));

		// The undo stack contains the removal of A but not the schema change
		assert.equal(checkout1Revertibles.undoStack.length, 1);
		assert.equal(checkout1Revertibles.redoStack.length, 1);
		assert.deepEqual(checkout1.getRemovedRoots().length, 2);

		provider.processMessages();

		assert.equal(checkout2Revertibles.undoStack.length, 1);
		assert.equal(checkout2Revertibles.redoStack.length, 1);
		// trunk trimming causes a removed root to be garbage collected
		assert.deepEqual(checkout2.getRemovedRoots().length, 1);

		checkout1Revertibles.unsubscribe();
		checkout2Revertibles.unsubscribe();
	});

	describe("branches with schema edits can be rebased", () => {
		it("over non-schema changes", () => {
			const provider = new TestTreeProviderLite(1);
			const checkout1 = provider.trees[0].checkout;

			checkout1.updateSchema(intoStoredSchema(jsonSequenceRootSchema));
			checkout1.editor.sequenceField(rootField).insert(
				0,
				cursorForJsonableTreeField([
					{ type: leaf.string.name, value: "A" },
					{ type: leaf.string.name, value: "B" },
					{ type: leaf.string.name, value: "C" },
				]),
			);

			const branch = checkout1.fork();

			// Remove "A" on the parent branch
			checkout1.editor.sequenceField(rootField).remove(0, 1);

			// Remove "B" on the child branch
			branch.editor.sequenceField(rootField).remove(1, 1);
			branch.updateSchema(intoStoredSchema(stringSequenceRootSchema));
			// Remove "C" on the child branch
			branch.editor.sequenceField(rootField).remove(1, 1);
			validateTreeContent(branch, {
				schema: stringSequenceRootSchema,
				initialTree: ["A"],
			});

			branch.rebaseOnto(checkout1);

			// The schema change and any changes after that should be dropped,
			// but the changes before the schema change should be preserved
			validateTreeContent(branch, {
				schema: jsonSequenceRootSchema,
				initialTree: ["C"],
			});
		});

		it("over schema changes", () => {
			const provider = new TestTreeProviderLite(1);
			const checkout1 = provider.trees[0].checkout;

			checkout1.updateSchema(intoStoredSchema(jsonSequenceRootSchema));
			checkout1.editor.sequenceField(rootField).insert(
				0,
				cursorForJsonableTreeField([
					{ type: leaf.string.name, value: "A" },
					{ type: leaf.string.name, value: "B" },
					{ type: leaf.string.name, value: "C" },
				]),
			);

			const branch = checkout1.fork();

			// Remove "A" and change the schema on the parent branch
			checkout1.editor.sequenceField(rootField).remove(0, 1);
			checkout1.updateSchema(intoStoredSchema(stringSequenceRootSchema));

			// Remove "B" on the child branch
			branch.editor.sequenceField(rootField).remove(1, 1);
			branch.updateSchema(intoStoredSchema(stringSequenceRootSchema));
			// Remove "C" on the child branch
			branch.editor.sequenceField(rootField).remove(1, 1);
			validateTreeContent(branch, {
				schema: stringSequenceRootSchema,
				initialTree: ["A"],
			});

			branch.rebaseOnto(checkout1);

			// All changes on the branch should be dropped
			validateTreeContent(branch, {
				schema: stringSequenceRootSchema,
				initialTree: ["B", "C"],
			});
		});
	});

	describe("revertibles", () => {
		itView("can be generated for changes made to the local branch", (view) => {
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe = view.events.on("commitApplied", (_, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				const revertible = getRevertible();
				assert.equal(revertible.status, RevertibleStatus.Valid);
				revertiblesCreated.push(revertible);
			});

			insertFirstNode(view, "A");

			assert.equal(revertiblesCreated.length, 1);

			insertFirstNode(view, "B");

			assert.equal(revertiblesCreated.length, 2);

			// Each revert also leads to the creation of a revertible event
			revertiblesCreated[1].revert(false);

			assert.equal(revertiblesCreated.length, 3);

			unsubscribe();
		});

		itView(
			"only invokes the onRevertibleDisposed callback when revertible is released",
			(view) => {
				const revertiblesCreated: Revertible[] = [];

				const unsubscribe = view.events.on("commitApplied", (_, getRevertible) => {
					assert(getRevertible !== undefined, "commit should be revertible");
					const revertible = getRevertible(onRevertibleDisposed);
					assert.equal(revertible.status, RevertibleStatus.Valid);
					revertiblesCreated.push(revertible);
				});

				const revertiblesDisposed: Revertible[] = [];

				function onRevertibleDisposed(disposed: Revertible): void {
					assert.equal(disposed.status, RevertibleStatus.Disposed);
					revertiblesDisposed.push(disposed);
				}

				insertFirstNode(view, "A");
				insertFirstNode(view, "B");

				assert.equal(revertiblesCreated.length, 2);
				assert.equal(revertiblesDisposed.length, 0);

				revertiblesCreated[0].dispose();

				assert.equal(revertiblesDisposed.length, 1);
				assert.equal(revertiblesDisposed[0], revertiblesCreated[0]);

				revertiblesCreated[1].revert(false);
				assert.equal(revertiblesDisposed.length, 1);

				revertiblesCreated[1].revert();
				assert.equal(revertiblesDisposed.length, 2);

				unsubscribe();
			},
		);

		itView(
			"revertibles cannot be acquired outside of the commitApplied event callback",
			(view) => {
				let acquireRevertible: RevertibleFactory | undefined;
				const unsubscribe = view.events.on("commitApplied", (_, getRevertible) => {
					assert(getRevertible !== undefined, "commit should be revertible");
					acquireRevertible = getRevertible;
				});

				insertFirstNode(view, "A");
				assert(acquireRevertible !== undefined);
				assert.throws(() => acquireRevertible?.());
				unsubscribe();
			},
		);

		itView("revertibles cannot be acquired more than once", (view) => {
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe1 = view.events.on("commitApplied", (_, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				const revertible = getRevertible();
				assert.equal(revertible.status, RevertibleStatus.Valid);
				revertiblesCreated.push(revertible);
			});
			const unsubscribe2 = view.events.on("commitApplied", (_, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				assert.throws(() => getRevertible());
			});

			insertFirstNode(view, "A");
			unsubscribe1();
			unsubscribe2();
		});

		itView("disposed revertibles cannot be released or reverted", (view) => {
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe = view.events.on("commitApplied", (_, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				const r = getRevertible();
				assert.equal(r.status, RevertibleStatus.Valid);
				revertiblesCreated.push(r);
			});

			insertFirstNode(view, "A");

			assert.equal(revertiblesCreated.length, 1);
			const revertible = revertiblesCreated[0];

			revertible.dispose();
			assert.equal(revertible.status, RevertibleStatus.Disposed);

			assert.throws(() => revertible.dispose());
			assert.throws(() => revertible.revert(false));

			assert.equal(revertible.status, RevertibleStatus.Disposed);
			unsubscribe();
		});

		itView("commitApplied events have the correct commit kinds", (view) => {
			const revertiblesCreated: Revertible[] = [];
			const commitKinds: CommitKind[] = [];
			const unsubscribe = view.events.on("commitApplied", ({ kind }, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				const revertible = getRevertible();
				assert.equal(revertible.status, RevertibleStatus.Valid);
				revertiblesCreated.push(revertible);
				commitKinds.push(kind);
			});

			insertFirstNode(view, "A");
			revertiblesCreated[0].revert();
			revertiblesCreated[1].revert();

			assert.deepEqual(commitKinds, [CommitKind.Default, CommitKind.Undo, CommitKind.Redo]);

			unsubscribe();
		});

		itView("disposing of a view also disposes of its revertibles", (view) => {
			const fork = view.fork();
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe = fork.events.on("commitApplied", (_, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				const r = getRevertible(onRevertibleDisposed);
				assert.equal(r.status, RevertibleStatus.Valid);
				revertiblesCreated.push(r);
			});

			const revertiblesDisposed: Revertible[] = [];
			function onRevertibleDisposed(disposed: Revertible): void {
				assert.equal(disposed.status, RevertibleStatus.Disposed);
				revertiblesDisposed.push(disposed);
			}

			insertFirstNode(fork, "A");

			assert.equal(revertiblesCreated.length, 1);
			assert.equal(revertiblesDisposed.length, 0);

			fork[disposeSymbol]();

			assert.equal(revertiblesCreated.length, 1);
			assert.equal(revertiblesDisposed.length, 1);
			assert.equal(revertiblesCreated[0], revertiblesDisposed[0]);

			unsubscribe();
		});

		itView("can be reverted after rebasing", (view) => {
			const fork = view.fork();
			insertFirstNode(fork, "A");

			const stacks = createTestUndoRedoStacks(fork.events);
			insertFirstNode(fork, "B");
			insertFirstNode(fork, "C");

			fork.rebaseOnto(view);

			assert.equal(getTestValue(fork), "C");
			// It should still be possible to revert the the child branch's revertibles
			assert.equal(stacks.undoStack.length, 2);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			stacks.undoStack.pop()!.revert();
			assert.equal(getTestValue(fork), "B");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			stacks.undoStack.pop()!.revert();
			assert.equal(getTestValue(fork), "A");

			stacks.unsubscribe();
		});

		for (const ageToTest of [0, 1, 5]) {
			itView(`Telemetry logs track reversion age (${ageToTest})`, (view, logger) => {
				let revertible: Revertible | undefined;
				const unsubscribe = view.events.on("commitApplied", (_, getRevertible) => {
					if (getRevertible === undefined) {
						assert.fail("Expected commit to be revertible.");
					}

					// Only save off the first revertible, as it's the only one we'll use.
					if (revertible === undefined) {
						revertible = getRevertible();
					}
				});

				// Insert (`ageToTest` + 1) nodes, then revert the first.
				for (let i = 0; i <= ageToTest; i++) {
					insertFirstNode(view, "A");
				}
				assert(revertible !== undefined, "Expected revertible to be created.");
				revertible.revert();

				const revertEvents = logger
					.events()
					.filter((event) => event.eventName.endsWith(TreeCheckout.revertTelemetryEventName));
				assert.equal(revertEvents.length, 1);
				assert.equal(revertEvents[0].age, ageToTest);

				unsubscribe();
			});
		}
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
function itView(
	title: string,
	fn: (view: ITreeCheckout, logger: IMockLoggerExt) => void,
	options: { initialContent?: TreeContent; skip?: true } = {},
): void {
	const content: TreeContent = options.initialContent ?? {
		schema: jsonSequenceRootSchema,
		initialTree: [],
	};
	const config = {
		...content,
		allowedSchemaModifications: AllowedUpdateType.Initialize,
	};

	const itFunction = options.skip === true ? it.skip.bind(it) : it;

	itFunction(`${title} (root view)`, () => {
		const provider = new TestTreeProviderLite();
		// Test an actual SharedTree.
		fn(schematizeFlexTree(provider.trees[0], config).checkout, provider.logger);
	});

	itFunction(`${title} (reference view)`, () => {
		const { checkout, logger } = createCheckoutWithContent(content);
		fn(checkout, logger);
	});

	itFunction(`${title} (forked view)`, () => {
		const provider = new TestTreeProviderLite();
		fn(schematizeFlexTree(provider.trees[0], config).checkout.fork(), provider.logger);
	});

	itFunction(`${title} (reference forked view)`, () => {
		const { checkout, logger } = createCheckoutWithContent(content);
		const fork = checkout.fork();
		fn(fork, logger);
	});
}

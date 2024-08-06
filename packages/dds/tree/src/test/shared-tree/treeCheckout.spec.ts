/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type IMockLoggerExt,
	createMockLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type FieldUpPath,
	type Revertible,
	rootFieldKey,
	RevertibleStatus,
	CommitKind,
	EmptyKey,
} from "../../core/index.js";
import { leaf } from "../../domains/index.js";
import {
	FieldKinds,
	cursorForJsonableTreeField,
	intoStoredSchema,
} from "../../feature-libraries/index.js";
import {
	Tree,
	TreeCheckout,
	type ITreeCheckout,
	type RevertibleFactory,
} from "../../shared-tree/index.js";
import {
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	expectSchemaEqual,
	forkView,
	getView,
	numberSequenceRootSchema,
	viewCheckout,
} from "../utils.js";
import { disposeSymbol, fail } from "../../util/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
} from "../../index.js";
// eslint-disable-next-line import/no-internal-modules
import { getOrCreateInnerNode } from "../../simple-tree/proxyBinding.js";
// eslint-disable-next-line import/no-internal-modules
import type { SchematizingSimpleTreeView } from "../../shared-tree/schematizingTreeView.js";
import { toFlexSchema } from "../../simple-tree/index.js";

const rootField: FieldUpPath = {
	parent: undefined,
	field: rootFieldKey,
};

const enableSchemaValidation = true;

describe("sharedTreeView", () => {
	describe("Events", () => {
		const sf = new SchemaFactory("Events test schema");
		const RootNode = sf.object("RootNode", { x: sf.number });

		it("triggers events for local and subtree changes", () => {
			const view = getView(
				new TreeViewConfiguration({ enableSchemaValidation, schema: RootNode }),
			);
			view.initialize({ x: 24 });
			const root = view.root;
			const anchorNode = getOrCreateInnerNode(root).anchorNode;
			const log: string[] = [];
			const unsubscribe = anchorNode.on("childrenChanging", () => log.push("change"));
			const unsubscribeSubtree = anchorNode.on("subtreeChanging", () => {
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
			const view = getView(
				new TreeViewConfiguration({ enableSchemaValidation, schema: RootNode }),
			);
			view.initialize({ x: 24 });
			const root = view.root;
			const anchorNode = getOrCreateInnerNode(root).anchorNode;
			const log: string[] = [];
			const unsubscribe = anchorNode.on("childrenChanging", (upPath) =>
				log.push(`change-${String(upPath.parentField)}-${upPath.parentIndex}`),
			);
			const unsubscribeSubtree = anchorNode.on("subtreeChanging", (upPath) => {
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
			const sf1 = new SchemaFactory("commit applied schema");
			const mixedSchema = sf1.optional([sf1.string, sf1.number]);
			const stringSchema = sf1.optional([sf1.string]);

			it("is fired for data and schema changes", () => {
				const provider = new TestTreeProviderLite(1);
				const checkout = provider.trees[0].checkout;

				const log: string[] = [];
				const unsubscribe = checkout.events.on("commitApplied", () =>
					log.push("commitApplied"),
				);

				assert.equal(log.length, 0);

				checkout.updateSchema(intoStoredSchema(toFlexSchema(mixedSchema)));

				assert.equal(log.length, 1);

				checkout.editor
					.optionalField(rootField)
					.set(cursorForJsonableTreeField([{ type: leaf.string.name, value: "A" }]), true);

				assert.equal(log.length, 2);

				checkout.updateSchema(intoStoredSchema(toFlexSchema(stringSchema)));

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

				checkout.updateSchema(intoStoredSchema(toFlexSchema(mixedSchema)));
				checkout.editor
					.optionalField(rootField)
					.set(cursorForJsonableTreeField([{ type: leaf.string.name, value: "A" }]), true);
				checkout.updateSchema(intoStoredSchema(toFlexSchema(stringSchema)));

				assert.deepEqual(log, ["not-revertible", "revertible", "not-revertible"]);
				unsubscribe();
			});
		});
	});

	describe("Views", () => {
		itView("can fork and apply edits without affecting the parent", (parent) => {
			parent.root.insertAtStart("parent");
			const child = forkView(parent);
			child.root.insertAtStart("child");
			assert.deepEqual([...parent.root], ["parent"]);
			assert.deepEqual([...child.root], ["child", "parent"]);
		});

		itView("can apply edits without affecting a fork", (parent) => {
			const child = forkView(parent);
			assert.equal(parent.root[0], undefined);
			assert.equal(child.root[0], undefined);
			parent.root.insertAtStart("root");
			assert.equal(parent.root[0], "root");
			assert.equal(child.root[0], undefined);
		});

		itView("can merge changes into a parent", (parent) => {
			const child = forkView(parent);
			child.root.insertAtStart("view");
			parent.checkout.merge(child.checkout);
			assert.equal(parent.root[0], "view");
		});

		itView("can rebase over a parent view", (parent) => {
			const child = forkView(parent);
			parent.root.insertAtStart("root");
			assert.equal(child.root[0], undefined);
			child.checkout.rebaseOnto(parent.checkout);
			assert.equal(child.root[0], "root");
		});

		itView("can rebase over a child view", (view) => {
			const parent = forkView(view);
			parent.root.insertAtStart("P1");
			const child = forkView(parent);
			parent.root.insertAtStart("P2");
			child.root.insertAtStart("C1");
			parent.checkout.rebaseOnto(child.checkout);
			assert.deepEqual([...child.root], ["C1", "P1"]);
			assert.deepEqual([...parent.root], ["P2", "C1", "P1"]);
		});

		itView("merge changes through multiple views", (viewA) => {
			const viewB = forkView(viewA);
			const viewC = forkView(viewB);
			const viewD = forkView(viewC);
			viewD.root.insertAtStart("view");
			viewC.checkout.merge(viewD.checkout);
			assert.equal(viewB.root[0], undefined);
			assert.equal(viewC.root[0], "view");
			viewB.checkout.merge(viewC.checkout);
			assert.equal(viewB.root[0], "view");
			assert.equal(viewC.root[0], "view");
		});

		itView("merge correctly when multiple ancestors are mutated", (viewA) => {
			const viewB = forkView(viewA);
			const viewC = forkView(viewB);
			const viewD = forkView(viewC);
			viewB.root.insertAtStart("B");
			viewC.root.insertAtStart("C");
			viewD.root.insertAtStart("D");
			viewC.checkout.merge(viewD.checkout);
			assert.equal(viewB.root[0], "B");
			assert.equal(viewC.root[0], "D");
			viewB.checkout.merge(viewC.checkout);
			assert.equal(viewB.root[0], "D");
		});

		itView("can merge a parent view into a child", (view) => {
			const parent = forkView(view);
			parent.root.insertAtStart("P1");
			const child = forkView(parent);
			parent.root.insertAtStart("P2");
			child.root.insertAtStart("C1");
			child.checkout.merge(parent.checkout);
			assert.deepEqual([...child.root], ["P2", "C1", "P1"]);
			assert.deepEqual([...parent.root], ["P2", "P1"]);
		});

		itView("can perform a complicated merge scenario", (viewA) => {
			const viewB = forkView(viewA);
			const viewC = forkView(viewB);
			const viewD = forkView(viewC);
			viewB.root.insertAtStart("A1");
			viewC.root.insertAtStart("B1");
			viewD.root.insertAtStart("C1");
			viewC.checkout.merge(viewD.checkout);
			viewA.root.insertAtStart("R1");
			viewB.root.insertAtStart("A2");
			viewC.root.insertAtStart("B2");
			viewB.checkout.merge(viewC.checkout);
			const viewE = forkView(viewB);
			viewB.root.insertAtStart("A3");
			viewE.checkout.rebaseOnto(viewB.checkout);
			assert.equal(viewE.root[0], "A3");
			viewB.root.insertAtStart("A4");
			viewE.root.insertAtStart("D1");
			viewA.root.insertAtStart("R2");
			viewB.checkout.merge(viewE.checkout);
			viewA.checkout.merge(viewB.checkout);
			viewA.root.insertAtStart("R3");
			assert.deepEqual(viewA.root, [
				"R3",
				"D1",
				"A4",
				"A3",
				"B2",
				"C1",
				"B1",
				"A2",
				"A1",
				"R2",
				"R1",
			]);
		});

		itView("update anchors after applying a change", (view) => {
			view.root.insertAtStart("A");
			let cursor = view.checkout.forest.allocateCursor();
			view.checkout.forest.moveCursorToPath(
				getOrCreateInnerNode(view.root).anchorNode,
				cursor,
			);
			cursor.enterField(EmptyKey);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			view.root.insertAtStart("B");
			cursor = view.checkout.forest.allocateCursor();
			view.checkout.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging into a parent", (parent) => {
			parent.root.insertAtStart("A");
			let cursor = parent.checkout.forest.allocateCursor();
			parent.checkout.forest.moveCursorToPath(
				getOrCreateInnerNode(parent.root).anchorNode,
				cursor,
			);
			cursor.enterField(EmptyKey);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = forkView(parent);
			child.root.insertAtStart("B");
			parent.checkout.merge(child.checkout);
			cursor = parent.checkout.forest.allocateCursor();
			parent.checkout.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging a branch into a divergent parent", (parent) => {
			parent.root.insertAtStart("A");
			let cursor = parent.checkout.forest.allocateCursor();
			parent.checkout.forest.moveCursorToPath(
				getOrCreateInnerNode(parent.root).anchorNode,
				cursor,
			);
			cursor.enterField(EmptyKey);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = forkView(parent);
			parent.root.insertAtStart("P");
			child.root.insertAtStart("B");
			parent.checkout.merge(child.checkout);
			cursor = parent.checkout.forest.allocateCursor();
			parent.checkout.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after undoing", (view) => {
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			view.root.insertAtStart("A");
			let cursor = view.checkout.forest.allocateCursor();
			view.checkout.forest.moveCursorToPath(
				getOrCreateInnerNode(view.root).anchorNode,
				cursor,
			);
			cursor.enterField(EmptyKey);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			view.root.insertAtStart("B");
			undoStack.pop()?.revert();
			cursor = view.checkout.forest.allocateCursor();
			view.checkout.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
			unsubscribe();
		});

		itView("can be mutated after merging", (parent) => {
			const child = forkView(parent);
			child.root.insertAtStart("A");
			parent.checkout.merge(child.checkout, false);
			child.root.insertAtStart("B");
			assert.deepEqual([...parent.root], ["A"]);
			assert.deepEqual([...child.root], ["B", "A"]);
			parent.checkout.merge(child.checkout);
			assert.deepEqual([...parent.root], ["B", "A"]);
		});

		itView("can rebase after merging", (parent) => {
			const child = forkView(parent);
			child.root.insertAtStart("A");
			parent.checkout.merge(child.checkout, false);
			parent.root.insertAtStart("B");
			child.checkout.rebaseOnto(parent.checkout);
			assert.deepEqual([...child.root], ["B", "A"]);
		});

		itView("can be read after merging", (parent) => {
			parent.root.insertAtStart("root");
			const child = forkView(parent);
			parent.checkout.merge(child.checkout);
			assert.equal(child.root[0], "root");
		});

		itView(
			"properly fork the tree schema",
			(parent) => {
				const schemaB = intoStoredSchema(
					toFlexSchema(new SchemaFactory("fork schema branch").optional(defaultSf.number)),
				);
				function getSchema(t: ITreeCheckout): "schemaA" | "schemaB" {
					return t.storedSchema.rootFieldSchema.kind === FieldKinds.required.identifier
						? "schemaA"
						: t.storedSchema.rootFieldSchema.kind === FieldKinds.optional.identifier
							? "schemaB"
							: fail("Unexpected schema");
				}

				assert.equal(getSchema(parent.checkout), "schemaA");
				const child = forkView(parent);
				child.checkout.updateSchema(schemaB);
				assert.equal(getSchema(parent.checkout), "schemaA");
				assert.equal(getSchema(child.checkout), "schemaB");
			},
			{
				initialContent: {
					schema: new SchemaFactory("fork schema").boolean,
					initialTree: true,
				},
			},
		);

		it("submit edits to Fluid when merging into the root view", () => {
			const sf = new SchemaFactory("edits submitted schema");
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);
			tree1.initialize([]);
			provider.processMessages();
			const tree2 = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);
			const baseView = forkView(tree1);
			const view = forkView(baseView);
			// Modify the view, but tree2 should remain unchanged until the edit merges all the way up
			view.root.insertAtStart("42");
			provider.processMessages();
			assert.equal(tree2.root[0], undefined);
			baseView.checkout.merge(view.checkout);
			provider.processMessages();
			assert.equal(tree2.root[0], undefined);
			tree1.checkout.merge(baseView.checkout);
			provider.processMessages();
			assert.equal(tree2.root[0], "42");
		});

		it("do not squash commits", () => {
			const sf = new SchemaFactory("no squash commits schema");
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);
			tree1.initialize([]);
			provider.processMessages();
			let opsReceived = 0;
			provider.trees[1].on("op", () => (opsReceived += 1));
			const baseView = forkView(tree1);
			const view = forkView(baseView);
			view.root.insertAtStart("A");
			view.root.insertAtStart("B");
			baseView.checkout.merge(view.checkout);
			tree1.checkout.merge(baseView.checkout);
			provider.processMessages();
			assert.equal(opsReceived, 2);
		});
	});

	describe("Transactions", () => {
		itView("update the tree while open", (view) => {
			Tree.runTransaction(view, () => {
				view.root.insertAtStart("42");
				assert.equal(view.root[0], "42");
			});
		});

		itView("update the tree after committing", (view) => {
			Tree.runTransaction(view, () => {
				view.root.insertAtStart("42");
			});
			assert.equal(view.root[0], "42");
		});

		itView("revert the tree after aborting", (view) => {
			Tree.runTransaction(view, () => {
				view.root.insertAtStart("42");
				return Tree.runTransaction.rollback;
			});
			assert.equal(view.root[0], undefined);
		});

		itView("can nest", (view) => {
			Tree.runTransaction(view, () => {
				view.root.insertAtEnd("A");
				Tree.runTransaction(view, () => {
					view.root.insertAtEnd("B");
					assert.deepEqual(view.root, ["A", "B"]);
				});
				assert.deepEqual(view.root, ["A", "B"]);
			});
			assert.deepEqual(view.root, ["A", "B"]);
		});

		itView("rejects merges while a transaction is in progress", (view) => {
			const fork = forkView(view);
			fork.root.insertAtEnd("42");

			Tree.runTransaction(view, () => {
				view.root.insertAtEnd("43");
				assert.throws(
					() => view.checkout.merge(fork.checkout, true),
					(e: Error) =>
						validateAssertionError(
							e,
							"Views cannot be merged into a view while it has a pending transaction",
						),
				);
			});
			assert.equal(view.root[0], "43");
		});

		itView("rejects rebases while a transaction is in progress", (view) => {
			const fork = forkView(view);
			view.root.insertAtEnd("42");

			Tree.runTransaction(fork, () => {
				fork.root.insertAtEnd("43");
				assert.throws(
					() => fork.checkout.rebaseOnto(view.checkout),
					(e: Error) =>
						validateAssertionError(
							e,
							"A view cannot be rebased while it has a pending transaction",
						),
				);
			});
			assert.equal(fork.root[0], "43");
		});

		itView("automatically commit if in progress when view merges", (view) => {
			const fork = forkView(view);
			fork.checkout.transaction.start();
			fork.root.insertAtEnd("42");
			fork.root.insertAtEnd("43");
			view.checkout.merge(fork.checkout, false);
			assert.deepEqual(fork.root, ["42", "43"]);
			assert.equal(fork.checkout.transaction.inProgress(), false);
		});

		itView("do not close across forks", (view) => {
			view.checkout.transaction.start();
			const fork = forkView(view);
			assert.throws(
				() => fork.checkout.transaction.commit(),
				(e: Error) => validateAssertionError(e, "No transaction is currently in progress"),
			);
		});

		itView("do not affect pre-existing forks", (view) => {
			const fork = forkView(view);
			view.root.insertAtEnd("A");
			Tree.runTransaction(fork, () => {
				view.root.insertAtEnd("B");
				return Tree.runTransaction.rollback;
			});
			view.root.insertAtEnd("C");
			view.checkout.merge(fork.checkout);
			assert.deepEqual(view.root, ["A", "B", "C"]);
		});

		// Disabled because rebases are not supported while a transaction is in progress
		// TODO: enable once ADO#8603 is complete.
		itView(
			"can handle a pull while in progress",
			(view) => {
				const fork = forkView(view);
				Tree.runTransaction(fork, () => {
					view.root.insertAtStart("42");
					fork.checkout.rebaseOnto(view.checkout);
					assert.equal(fork.root[0], "42");
				});
				assert.equal(fork.root[0], "42");
			},
			{ skip: true },
		);

		itView("update anchors correctly", (view) => {
			view.root.insertAtStart("A");
			let cursor = view.checkout.forest.allocateCursor();
			view.checkout.forest.moveCursorToPath(
				getOrCreateInnerNode(view.root).anchorNode,
				cursor,
			);
			cursor.enterField(EmptyKey);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			view.root.insertAtStart("B");
			cursor = view.checkout.forest.allocateCursor();
			view.checkout.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		// Disabled because merges are not supported while a transaction is in progress
		// TODO: enable once ADO#8602 is complete.
		itView(
			"can handle a complicated scenario",
			(view) => {
				view.root.insertAtEnd("A");
				Tree.runTransaction(view, () => {
					view.root.insertAtEnd("B");
					view.root.insertAtEnd("C");
					Tree.runTransaction(view, () => {
						view.root.insertAtEnd("D");
					});
					const fork = forkView(view);
					fork.root.insertAtEnd("E");
					Tree.runTransaction(fork, () => {
						fork.root.insertAtEnd("F");
					});
					view.root.insertAtEnd("G");
					fork.root.insertAtEnd("H");
					Tree.runTransaction(fork, () => {
						fork.root.insertAtEnd("I");
						return Tree.runTransaction.rollback;
					});
					view.checkout.merge(fork.checkout);
					view.root.insertAtEnd("J");
					Tree.runTransaction(view, () => {
						const fork2 = forkView(view);
						fork2.root.insertAtEnd("K");
						fork2.root.insertAtEnd("L");
						view.checkout.merge(fork2.checkout);
						return Tree.runTransaction.rollback;
					});
					view.root.insertAtEnd("M");
				});
				view.root.insertAtEnd("N");
				view.root.insertAtEnd("O");
				assert.deepEqual(
					[...view.root],
					["A", "B", "C", "D", "G", "E", "F", "H", "J", "M", "N", "O"],
				);
			},
			{ skip: true },
		);
	});

	describe("disposal", () => {
		itView("forks can be disposed", (view) => {
			const fork = forkView(view);
			fork.checkout[disposeSymbol]();
		});

		itView("disposed forks cannot be edited or double-disposed", (view) => {
			const fork = forkView(view);
			fork.checkout[disposeSymbol]();

			assert.throws(() => fork.root.insertAtStart("A"));
			assert.throws(() =>
				fork.checkout.updateSchema(intoStoredSchema(numberSequenceRootSchema)),
			);
			assert.throws(() => fork.checkout[disposeSymbol]());
		});
	});

	it("schema edits do not cause clients to purge detached trees or revertibles", () => {
		const sf1 = new SchemaFactory("schema1");
		const schema1 = sf1.array([sf1.string, sf1.number]);

		const provider = new TestTreeProviderLite(2);
		const view1 = provider.trees[0].viewWith(
			new TreeViewConfiguration({ schema: schema1, enableSchemaValidation }),
		);
		const view2 = provider.trees[1].viewWith(
			new TreeViewConfiguration({ schema: schema1, enableSchemaValidation }),
		);

		view1.initialize(["A", 1, "B", 2]);
		const storedSchema1 = intoStoredSchema(toFlexSchema(schema1));
		provider.processMessages();

		const checkout1Revertibles = createTestUndoRedoStacks(view1.checkout.events);

		view1.root.removeAt(0); // Remove "A"
		view1.root.removeAt(0); // Remove 1
		checkout1Revertibles.undoStack.pop()?.revert(); // Restore 1
		provider.processMessages();

		const checkout2Revertibles = createTestUndoRedoStacks(view2.checkout.events);
		view2.root.removeAt(1); // Remove "B"
		view2.root.removeAt(1); // Remove 2
		checkout2Revertibles.undoStack.pop()?.revert(); // Restore 2
		provider.processMessages();

		expectSchemaEqual(storedSchema1, view1.checkout.storedSchema);
		expectSchemaEqual(storedSchema1, view2.checkout.storedSchema);
		assert.deepEqual(view1.root, [1, 2]);
		assert.deepEqual(view2.root, [1, 2]);

		assert.equal(checkout1Revertibles.undoStack.length, 1);
		assert.equal(checkout1Revertibles.redoStack.length, 1);
		assert.equal(view1.checkout.getRemovedRoots().length, 2);

		assert.equal(checkout2Revertibles.undoStack.length, 1);
		assert.equal(checkout2Revertibles.redoStack.length, 1);
		assert.equal(view2.checkout.getRemovedRoots().length, 2);

		const sf2 = new SchemaFactory("schema2");
		provider.trees[0].checkout.updateSchema(
			intoStoredSchema(toFlexSchema(sf2.array(sf1.number))),
		);

		// The undo stack contains the removal of A but not the schema change
		assert.equal(checkout1Revertibles.undoStack.length, 1);
		assert.equal(checkout1Revertibles.redoStack.length, 1);
		assert.deepEqual(provider.trees[0].checkout.getRemovedRoots().length, 2);

		provider.processMessages();

		assert.equal(checkout2Revertibles.undoStack.length, 1);
		assert.equal(checkout2Revertibles.redoStack.length, 1);
		// trunk trimming causes a removed root to be garbage collected
		assert.deepEqual(provider.trees[1].checkout.getRemovedRoots().length, 1);

		checkout1Revertibles.unsubscribe();
		checkout2Revertibles.unsubscribe();
	});

	describe("branches with schema edits can be rebased", () => {
		it.skip("over non-schema changes", () => {
			const sf1 = new SchemaFactory("schema1");
			const oldSchema = sf1.array(sf1.string);

			const provider = new TestTreeProviderLite(1);
			const oldSchemaConfig = { schema: oldSchema, enableSchemaValidation };
			const view1 = provider.trees[0].viewWith(new TreeViewConfiguration(oldSchemaConfig));
			view1.initialize(["A", "B", "C"]);

			const branch = forkView(view1);

			// Remove "A" on the parent branch
			view1.root.removeAt(0);

			// Remove "B" on the child branch
			branch.root.removeAt(1);

			const sf2 = new SchemaFactory("schema1");
			const newSchema = [sf2.array(sf2.string), sf2.array([sf2.string, sf2.number])];
			const branchWithNewSchema = viewCheckout(
				branch.checkout,
				new TreeViewConfiguration({ schema: newSchema, enableSchemaValidation }),
			);
			branchWithNewSchema.upgradeSchema();
			// Remove "C" on the child branch
			branchWithNewSchema.root.removeAt(1);

			expectSchemaEqual(
				intoStoredSchema(toFlexSchema(newSchema)),
				branchWithNewSchema.checkout.storedSchema,
			);
			assert.deepEqual(branchWithNewSchema.root, ["A"]);

			branch.checkout.rebaseOnto(view1.checkout);

			// The schema change and any changes after that should be dropped,
			// but the changes before the schema change should be preserved
			expectSchemaEqual(
				intoStoredSchema(toFlexSchema(oldSchema)),
				branch.checkout.storedSchema,
			);
			const branchWithOldSchema = viewCheckout(
				branch.checkout,
				new TreeViewConfiguration(oldSchemaConfig),
			);
			assert.deepEqual(branchWithOldSchema.root, ["C"]);
		});

		it.skip("over schema changes", () => {
			const sf1 = new SchemaFactory("schema1");
			const oldSchema = sf1.array(sf1.string);

			const provider = new TestTreeProviderLite(1);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({ schema: oldSchema, enableSchemaValidation }),
			);
			view1.initialize(["A", "B", "C"]);

			const branch = forkView(view1);

			// Remove "A" and change the schema on the parent branch
			view1.root.removeAt(0);
			const sf2 = new SchemaFactory("schema1");
			const newSchema = [sf2.array(sf2.string), sf2.array([sf2.string, sf2.number])];
			provider.trees[0]
				.viewWith(new TreeViewConfiguration({ schema: newSchema, enableSchemaValidation }))
				.upgradeSchema();

			// Remove "B" on the child branch
			branch.root.removeAt(1);
			const branchWithNewSchema = viewCheckout(
				branch.checkout,
				new TreeViewConfiguration({
					schema: newSchema,
					enableSchemaValidation,
				}),
			);
			branchWithNewSchema.upgradeSchema();
			// Remove "C" on the child branch
			branchWithNewSchema.root.removeAt(1);
			expectSchemaEqual(
				intoStoredSchema(toFlexSchema(newSchema)),
				branchWithNewSchema.checkout.storedSchema,
			);
			assert.deepEqual(branchWithNewSchema.root, ["A"]);

			branch.checkout.rebaseOnto(view1.checkout);

			// All changes on the branch should be dropped
			expectSchemaEqual(
				intoStoredSchema(toFlexSchema(newSchema)),
				branch.checkout.storedSchema,
			);
			assert.deepEqual(
				viewCheckout(
					branch.checkout,
					new TreeViewConfiguration({ schema: newSchema, enableSchemaValidation }),
				).root,
				["B", "C"],
			);
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

			view.root.insertAtStart("A");

			assert.equal(revertiblesCreated.length, 1);

			view.root.insertAtStart("B");

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

				view.root.insertAtStart("A");
				view.root.insertAtStart("B");

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

				view.root.insertAtStart("A");
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

			view.root.insertAtStart("A");
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

			view.root.insertAtStart("A");

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

			view.root.insertAtStart("A");
			revertiblesCreated[0].revert();
			revertiblesCreated[1].revert();

			assert.deepEqual(commitKinds, [CommitKind.Default, CommitKind.Undo, CommitKind.Redo]);

			unsubscribe();
		});

		itView("disposing of a view also disposes of its revertibles", (view) => {
			const fork = forkView(view);
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

			fork.root.insertAtStart("A");

			assert.equal(revertiblesCreated.length, 1);
			assert.equal(revertiblesDisposed.length, 0);

			fork.checkout[disposeSymbol]();

			assert.equal(revertiblesCreated.length, 1);
			assert.equal(revertiblesDisposed.length, 1);
			assert.equal(revertiblesCreated[0], revertiblesDisposed[0]);

			unsubscribe();
		});

		itView("can be reverted after rebasing", (view) => {
			const fork = forkView(view);
			fork.root.insertAtStart("A");

			const stacks = createTestUndoRedoStacks(fork.events);
			fork.root.insertAtStart("B");
			fork.root.insertAtStart("C");

			fork.checkout.rebaseOnto(view.checkout);

			assert.equal(fork.root[0], "C");
			// It should still be possible to revert the the child branch's revertibles
			assert.equal(stacks.undoStack.length, 2);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			stacks.undoStack.pop()!.revert();
			assert.equal(fork.root[0], "B");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			stacks.undoStack.pop()!.revert();
			assert.equal(fork.root[0], "A");

			stacks.unsubscribe();
		});

		for (const ageToTest of [0, 1, 5]) {
			itView(`Telemetry logs track reversion age (${ageToTest})`, (view, logger) => {
				let revertible: Revertible | undefined;
				const unsubscribe = view.events.on("commitApplied", (_, getRevertible) => {
					assert(getRevertible !== undefined, "Expected commit to be revertible.");
					// Only save off the first revertible, as it's the only one we'll use.
					if (revertible === undefined) {
						revertible = getRevertible();
					}
				});

				// Insert (`ageToTest` + 1) nodes, then revert the first.
				for (let i = 0; i <= ageToTest; i++) {
					view.root.insertAtStart("A");
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

const defaultSf = new SchemaFactory("Checkout and view test schema");
const rootArray = defaultSf.array(defaultSf.string);

/**
 * Runs the given test function as two tests,
 * one where `view` is the root SharedTree view and the other where `view` is a fork.
 * This is useful for testing because both `SharedTree` and `SharedTreeFork` implement `ISharedTreeView` in different ways.
 *
 * TODO: users of this are making schema: one has been provided that might be close, but likely isn't fully correct..
 * TODO: users of this doesn't depend on SharedTree directly and should be moved to tests of SharedTreeView.
 */
function itView<
	T extends InsertableTreeFieldFromImplicitField<TRootSchema>,
	TRootSchema extends ImplicitFieldSchema = typeof rootArray,
>(
	title: string,
	fn: (view: SchematizingSimpleTreeView<TRootSchema>, logger: IMockLoggerExt) => void,
	options: {
		initialContent: { schema: TRootSchema; initialTree: T };
		skip?: true;
	},
): void;
function itView(
	title: string,
	fn: (view: SchematizingSimpleTreeView<typeof rootArray>, logger: IMockLoggerExt) => void,
	options?: {
		skip?: true;
	},
): void;
function itView<
	T extends InsertableTreeFieldFromImplicitField<TRootSchema>,
	TRootSchema extends ImplicitFieldSchema = typeof rootArray,
>(
	title: string,
	fn: (view: SchematizingSimpleTreeView<TRootSchema>, logger: IMockLoggerExt) => void,
	options: {
		initialContent?: { schema: TRootSchema; initialTree: T };
		skip?: true;
	} = {},
): void {
	const itFunction = options.skip === true ? it.skip.bind(it) : it;

	function callWithView(
		thunk: typeof fn,
		makeViewFromConfig: (
			config: TreeViewConfiguration<TRootSchema>,
		) => [SchematizingSimpleTreeView<TRootSchema>, IMockLoggerExt],
	): void {
		const provider = new TestTreeProviderLite();
		if (options.initialContent) {
			const [view, logger] = makeViewFromConfig(
				new TreeViewConfiguration({
					schema: options.initialContent.schema,
					enableSchemaValidation,
				}),
			);
			view.initialize(options.initialContent.initialTree);
			thunk(view, provider.logger);
		} else {
			const [view, logger] = (
				makeViewFromConfig as unknown as (
					config: TreeViewConfiguration<typeof rootArray>,
				) => [SchematizingSimpleTreeView<typeof rootArray>, IMockLoggerExt]
			)(
				new TreeViewConfiguration({
					schema: rootArray,
					enableSchemaValidation,
				}),
			);
			view.initialize([]);
			// down cast here is safe due to overload protections
			(
				thunk as unknown as (
					view: SchematizingSimpleTreeView<typeof rootArray>,
					logger: IMockLoggerExt,
				) => void
			)(view, logger);
		}
	}

	function makeReferenceView(
		config: TreeViewConfiguration<TRootSchema>,
		fork: boolean,
	): [SchematizingSimpleTreeView<TRootSchema>, IMockLoggerExt] {
		const logger = createMockLoggerExt();
		const view = getView(config, undefined, logger);
		return [fork ? forkView(view) : view, logger];
	}

	itFunction(`${title} (root view)`, () => {
		const provider = new TestTreeProviderLite();
		callWithView(fn, (config) => [provider.trees[0].viewWith(config), provider.logger]);
	});

	itFunction(`${title} (reference view)`, () => {
		callWithView(fn, (config) => makeReferenceView(config, false));
	});

	itFunction(`${title} (forked view)`, () => {
		const provider = new TestTreeProviderLite();
		callWithView(fn, (config) => [
			forkView(provider.trees[0].viewWith(config)),
			provider.logger,
		]);
	});

	itFunction(`${title} (reference forked view)`, () => {
		callWithView(fn, (config) => makeReferenceView(config, true));
	});
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type IMockLoggerExt,
	createMockLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type Revertible,
	rootFieldKey,
	RevertibleStatus,
	CommitKind,
	EmptyKey,
	type RevertibleFactory,
	type NormalizedFieldUpPath,
} from "../../core/index.js";
import { FieldKinds, cursorForJsonableTreeField } from "../../feature-libraries/index.js";
import {
	getBranch,
	Tree,
	TreeCheckout,
	type ITreeCheckout,
	type ITreeCheckoutFork,
	type BranchableTree,
} from "../../shared-tree/index.js";
import {
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	expectSchemaEqual,
	getView,
	validateUsageError,
	viewCheckout,
} from "../utils.js";
import { brand, fail } from "../../util/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
} from "../../index.js";
// eslint-disable-next-line import/no-internal-modules
import { SchematizingSimpleTreeView } from "../../shared-tree/schematizingTreeView.js";
import {
	asTreeViewAlpha,
	getOrCreateInnerNode,
	toStoredSchema,
	type InsertableField,
	type TreeBranch,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { stringSchema } from "../../simple-tree/leafNodeSchema.js";

const rootField: NormalizedFieldUpPath = {
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
			const unsubscribe = anchorNode.events.on("childrenChanging", () => log.push("change"));
			const unsubscribeSubtree = anchorNode.events.on("subtreeChanging", () => {
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
			const unsubscribe = anchorNode.events.on("childrenChanging", (upPath) =>
				log.push(`change-${String(upPath.parentField)}-${upPath.parentIndex}`),
			);
			const unsubscribeSubtree = anchorNode.events.on("subtreeChanging", (upPath) => {
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

		describe("changed", () => {
			const sf1 = new SchemaFactory("commit applied schema");
			const mixedSchema = sf1.optional([sf1.string, sf1.number]);
			const OptionalString = sf1.optional([sf1.string]);

			it("is fired for data and schema changes", () => {
				const provider = new TestTreeProviderLite(1);
				const checkout = provider.trees[0].checkout;

				const log: string[] = [];
				const unsubscribe = checkout.events.on("changed", () => log.push("changed"));

				assert.equal(log.length, 0);

				checkout.updateSchema(toStoredSchema(mixedSchema));

				assert.equal(log.length, 1);

				checkout.editor
					.optionalField(rootField)
					.set(
						cursorForJsonableTreeField([{ type: brand(stringSchema.identifier), value: "A" }]),
						true,
					);

				assert.equal(log.length, 2);

				checkout.updateSchema(toStoredSchema(OptionalString));

				assert.equal(log.length, 3);
				unsubscribe();
			});

			it("does not allow schema changes to be reverted", () => {
				const provider = new TestTreeProviderLite(1);
				const checkout = provider.trees[0].checkout;

				const log: string[] = [];
				const unsubscribe = checkout.events.on("changed", (data, getRevertible) =>
					log.push(getRevertible === undefined ? "not-revertible" : "revertible"),
				);

				assert.deepEqual(log, []);

				checkout.updateSchema(toStoredSchema(mixedSchema));
				checkout.editor
					.optionalField(rootField)
					.set(
						cursorForJsonableTreeField([{ type: brand(stringSchema.identifier), value: "A" }]),
						true,
					);
				checkout.updateSchema(toStoredSchema(OptionalString));

				assert.deepEqual(log, ["not-revertible", "revertible", "not-revertible"]);
				unsubscribe();
			});
		});
	});

	describe("Views", () => {
		itView(
			"can fork and apply edits without affecting the parent",
			({ view: parentView, tree: parentTree }) => {
				parentView.root.insertAtStart("parent");
				const childTree = parentTree.branch();
				const childView = childTree.viewWith(parentView.config);
				childView.root.insertAtStart("child");
				assert.deepEqual([...parentView.root], ["parent"]);
				assert.deepEqual([...childView.root], ["child", "parent"]);
			},
		);

		itView(
			"can apply edits without affecting a fork",
			({ view: parentView, tree: parentTree }) => {
				const childTree = parentTree.branch();
				const childView = childTree.viewWith(parentView.config);
				assert.equal(parentView.root[0], undefined);
				assert.equal(childView.root[0], undefined);
				parentView.root.insertAtStart("root");
				assert.equal(parentView.root[0], "root");
				assert.equal(childView.root[0], undefined);
			},
		);

		itView("can merge changes into a parent", ({ view: parentView, tree: parentTree }) => {
			const childTree = parentTree.branch();
			const childView = childTree.viewWith(parentView.config);
			childView.root.insertAtStart("view");
			parentTree.merge(childTree);
			assert.equal(parentView.root[0], "view");
		});

		itView("can rebase over a parent view", ({ view: parentView, tree: parentTree }) => {
			const childTree = parentTree.branch();
			const childView = childTree.viewWith(parentView.config);
			parentView.root.insertAtStart("root");
			assert.equal(childView.root[0], undefined);
			childTree.rebaseOnto(parentTree);
			assert.equal(childView.root[0], "root");
		});

		itView("can rebase over a child view", ({ view, tree }) => {
			const parentTree = tree.branch();
			const parentView = parentTree.viewWith(view.config);
			parentView.root.insertAtStart("P1");
			const childTree = parentTree.branch();
			const childView = childTree.viewWith(view.config);
			parentView.root.insertAtStart("P2");
			childView.root.insertAtStart("C1");
			parentTree.rebaseOnto(childTree);
			assert.deepEqual([...childView.root], ["C1", "P1"]);
			assert.deepEqual([...parentView.root], ["P2", "C1", "P1"]);
		});

		itView("merge changes through multiple views", ({ view: viewA, tree: treeA }) => {
			const treeB = treeA.branch();
			const viewB = treeB.viewWith(viewA.config);
			const treeC = treeB.branch();
			const viewC = treeC.viewWith(viewA.config);
			const treeD = treeC.branch();
			const viewD = treeD.viewWith(viewA.config);
			viewD.root.insertAtStart("view");
			treeC.merge(treeD);
			assert.equal(viewB.root[0], undefined);
			assert.equal(viewC.root[0], "view");
			treeB.merge(treeC, false);
			assert.equal(viewB.root[0], "view");
			assert.equal(viewC.root[0], "view");
		});

		itView(
			"merge correctly when multiple ancestors are mutated",
			({ view: viewA, tree: treeA }) => {
				const treeB = treeA.branch();
				const viewB = treeB.viewWith(viewA.config);
				const treeC = treeB.branch();
				const viewC = treeC.viewWith(viewA.config);
				const treeD = treeC.branch();
				const viewD = treeD.viewWith(viewA.config);
				viewB.root.insertAtStart("B");
				viewC.root.insertAtStart("C");
				viewD.root.insertAtStart("D");
				treeC.merge(treeD);
				assert.equal(viewB.root[0], "B");
				assert.equal(viewC.root[0], "D");
				treeB.merge(treeC);
				assert.equal(viewB.root[0], "D");
			},
		);

		itView("can merge a parent view into a child", ({ view, tree }) => {
			const parentTree = tree.branch();
			const parentView = parentTree.viewWith(view.config);
			parentView.root.insertAtStart("P1");
			const childTree = parentTree.branch();
			const childView = childTree.viewWith(view.config);
			parentView.root.insertAtStart("P2");
			childView.root.insertAtStart("C1");
			childTree.merge(parentTree, false);
			assert.deepEqual([...childView.root], ["P2", "C1", "P1"]);
			assert.deepEqual([...parentView.root], ["P2", "P1"]);
		});

		itView("can perform a complicated merge scenario", ({ view: viewA, tree: treeA }) => {
			const treeB = treeA.branch();
			const viewB = treeB.viewWith(viewA.config);
			const treeC = treeB.branch();
			const viewC = treeC.viewWith(viewA.config);
			const treeD = treeC.branch();
			const viewD = treeD.viewWith(viewA.config);
			viewB.root.insertAtStart("A1");
			viewC.root.insertAtStart("B1");
			viewD.root.insertAtStart("C1");
			treeC.merge(treeD);
			viewA.root.insertAtStart("R1");
			viewB.root.insertAtStart("A2");
			viewC.root.insertAtStart("B2");
			treeB.merge(treeC);
			const treeE = treeB.branch();
			const viewE = treeE.viewWith(viewA.config);
			viewB.root.insertAtStart("A3");
			treeE.rebaseOnto(treeB);
			assert.equal(viewE.root[0], "A3");
			viewB.root.insertAtStart("A4");
			viewE.root.insertAtStart("D1");
			viewA.root.insertAtStart("R2");
			treeB.merge(treeE);
			treeA.merge(treeB);
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

		itView("update anchors after applying a change", ({ view }) => {
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

		itView(
			"update anchors after merging into a parent",
			({ view: parentView, tree: parentTree }) => {
				const parentCheckout = parentView.checkout;
				parentView.root.insertAtStart("A");
				let cursor = parentCheckout.forest.allocateCursor();
				parentCheckout.forest.moveCursorToPath(
					getOrCreateInnerNode(parentView.root).anchorNode,
					cursor,
				);
				cursor.enterField(EmptyKey);
				cursor.firstNode();
				const anchor = cursor.buildAnchor();
				cursor.clear();
				const childTree = parentTree.branch();
				const childView = childTree.viewWith(parentView.config);
				childView.root.insertAtStart("B");
				parentTree.merge(childTree);
				cursor = parentCheckout.forest.allocateCursor();
				parentCheckout.forest.tryMoveCursorToNode(anchor, cursor);
				assert.equal(cursor.value, "A");
				cursor.clear();
			},
		);

		itView(
			"update anchors after merging a branch into a divergent parent",
			({ view: parentView, tree: parentTree }) => {
				const parentCheckout = parentView.checkout;
				parentView.root.insertAtStart("A");
				let cursor = parentCheckout.forest.allocateCursor();
				parentCheckout.forest.moveCursorToPath(
					getOrCreateInnerNode(parentView.root).anchorNode,
					cursor,
				);
				cursor.enterField(EmptyKey);
				cursor.firstNode();
				const anchor = cursor.buildAnchor();
				cursor.clear();
				const childTree = parentTree.branch();
				const childView = childTree.viewWith(parentView.config);
				parentView.root.insertAtStart("P");
				childView.root.insertAtStart("B");
				parentTree.merge(childTree);
				cursor = parentCheckout.forest.allocateCursor();
				parentCheckout.forest.tryMoveCursorToNode(anchor, cursor);
				assert.equal(cursor.value, "A");
				cursor.clear();
			},
		);

		itView("update anchors after undoing", ({ view }) => {
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

		itView("can be mutated after merging", ({ view: parentView, tree: parentTree }) => {
			const childTree = parentTree.branch();
			const childView = childTree.viewWith(parentView.config);
			childView.root.insertAtStart("A");
			parentTree.merge(childTree, false);
			childView.root.insertAtStart("B");
			assert.deepEqual([...parentView.root], ["A"]);
			assert.deepEqual([...childView.root], ["B", "A"]);
			parentTree.merge(childTree);
			assert.deepEqual([...parentView.root], ["B", "A"]);
		});

		itView("can rebase after merging", ({ view: parentView, tree: parentTree }) => {
			const childTree = parentTree.branch();
			const childView = childTree.viewWith(parentView.config);
			childView.root.insertAtStart("A");
			parentTree.merge(childTree, false);
			parentView.root.insertAtStart("B");
			childTree.rebaseOnto(parentTree);
			assert.deepEqual([...childView.root], ["B", "A"]);
		});

		itView("can be read after merging", ({ view: parentView, tree: parentTree }) => {
			parentView.root.insertAtStart("root");
			const childTree = parentTree.branch();
			const childView = childTree.viewWith(parentView.config);
			parentTree.merge(childTree, false);
			assert.equal(childView.root[0], "root");
		});

		itView(
			"properly fork the tree schema",
			({ view: parentView, tree: parentTree }) => {
				const schemaB = new SchemaFactory("fork schema branch").optional(defaultSf.number);
				function getSchema(t: ITreeCheckout): "schemaA" | "schemaB" {
					return t.storedSchema.rootFieldSchema.kind === FieldKinds.required.identifier
						? "schemaA"
						: t.storedSchema.rootFieldSchema.kind === FieldKinds.optional.identifier
							? "schemaB"
							: fail("Unexpected schema");
				}

				assert.equal(getSchema(parentView.checkout), "schemaA");
				const childTree = parentTree.branch();
				const childView = childTree.viewWith(new TreeViewConfiguration({ schema: schemaB }));
				childView.upgradeSchema();
				assert.equal(getSchema(parentView.checkout), "schemaA");
				assert(childView instanceof SchematizingSimpleTreeView);
				assert.equal(getSchema(childView.checkout), "schemaB");
			},
			{
				initialContent: {
					schema: SchemaFactory.number,
					initialTree: 3,
				},
			},
		);

		it("submit edits to Fluid when merging into the root view", () => {
			const sf = new SchemaFactory("edits submitted schema");
			const provider = new TestTreeProviderLite(2);
			const branch1 = getBranch(provider.trees[0]);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);
			view1.initialize([]);
			provider.processMessages();
			const tree2 = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);
			const baseTree = branch1.branch();
			const tree = baseTree.branch();
			const view = tree.viewWith(view1.config);
			// Modify the view, but tree2 should remain unchanged until the edit merges all the way up
			view.root.insertAtStart("42");
			provider.processMessages();
			assert.equal(tree2.root[0], undefined);
			baseTree.merge(tree);
			provider.processMessages();
			assert.equal(tree2.root[0], undefined);
			branch1.merge(baseTree);
			provider.processMessages();
			assert.equal(tree2.root[0], "42");
		});

		it("do not squash commits", () => {
			const sf = new SchemaFactory("no squash commits schema");
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0];
			const branch1 = getBranch(tree1);
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);
			view1.initialize([]);
			provider.processMessages();
			let opsReceived = 0;
			provider.trees[1].on("op", () => (opsReceived += 1));
			const baseBranch = branch1.branch();
			const tree = baseBranch.branch();
			const view = tree.viewWith(view1.config);
			view.root.insertAtStart("A");
			view.root.insertAtStart("B");
			baseBranch.merge(tree);
			branch1.merge(baseBranch);
			provider.processMessages();
			assert.equal(opsReceived, 2);
		});

		it("cannot create a second view from an uninitialized simple tree view's checkout", () => {
			const sf = new SchemaFactory("schema1");
			const provider = new TestTreeProviderLite(1);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);

			// Create a second view from the same checkout before initializing it. A CheckoutFlexTreeView won't be
			// created yet which has its own validation.
			assert.throws(
				() =>
					provider.trees[0].viewWith(
						new TreeViewConfiguration({
							schema: sf.array(sf.string),
							enableSchemaValidation,
						}),
					),
				validateUsageError("Cannot create a second tree view from the same checkout"),
			);
		});

		it("cannot create a second view from an initialized simple tree view's checkout", () => {
			const sf = new SchemaFactory("schema1");
			const provider = new TestTreeProviderLite(1);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: sf.array(sf.string),
					enableSchemaValidation,
				}),
			);

			view1.initialize(["A"]);

			assert.throws(
				() =>
					provider.trees[0].viewWith(
						new TreeViewConfiguration({
							schema: sf.array(sf.string),
							enableSchemaValidation,
						}),
					),
				validateUsageError("Cannot create a second tree view from the same checkout"),
			);
		});
	});

	describe("Transactions", () => {
		itView("update the tree while open", ({ view }) => {
			Tree.runTransaction(view, () => {
				view.root.insertAtStart("42");
				assert.equal(view.root[0], "42");
			});
		});

		itView("update the tree after committing", ({ view }) => {
			Tree.runTransaction(view, () => {
				view.root.insertAtStart("42");
			});
			assert.equal(view.root[0], "42");
		});

		itView("revert the tree after aborting", ({ view }) => {
			Tree.runTransaction(view, () => {
				view.root.insertAtStart("42");
				return Tree.runTransaction.rollback;
			});
			assert.equal(view.root[0], undefined);
		});

		itView("can nest", ({ view }) => {
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

		itView("rejects merges while a transaction is in progress", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = treeBranch.viewWith(view.config);
			viewBranch.root.insertAtEnd("42");

			assert.throws(
				() => {
					Tree.runTransaction(view, () => {
						view.root.insertAtEnd("43");
						tree.merge(treeBranch, true);
					});
				},
				(e: Error) =>
					validateAssertionError(
						e,
						"Views cannot be merged into a view while it has a pending transaction",
					),
			);
		});

		itView("rejects rebases while a transaction is in progress", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = treeBranch.viewWith(view.config);
			view.root.insertAtEnd("42");

			Tree.runTransaction(viewBranch, () => {
				viewBranch.root.insertAtEnd("43");
				assert.throws(
					() => treeBranch.rebaseOnto(tree),
					(e: Error) =>
						validateAssertionError(
							e,
							"A view cannot be rebased while it has a pending transaction",
						),
				);
			});
			assert.equal(viewBranch.root[0], "43");
		});

		itView("automatically commit if in progress when view merges", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = treeBranch.viewWith(view.config);
			assert(viewBranch instanceof SchematizingSimpleTreeView);
			viewBranch.checkout.transaction.start();
			viewBranch.root.insertAtEnd("42");
			viewBranch.root.insertAtEnd("43");
			tree.merge(treeBranch, false);
			assert.deepEqual(viewBranch.root, ["42", "43"]);
			assert.equal(viewBranch.checkout.transaction.isInProgress(), false);
		});

		itView("do not close across forks", ({ view, tree }) => {
			view.checkout.transaction.start();
			const treeBranch = tree.branch();
			const viewBranch = treeBranch.viewWith(view.config);
			assert(viewBranch instanceof SchematizingSimpleTreeView);
			view.root.insertAtEnd("A");
			assert.throws(
				() => viewBranch.checkout.transaction.commit(),
				(e: Error) => validateAssertionError(e, "No transaction to commit"),
			);
		});

		itView("do not affect pre-existing forks", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = treeBranch.viewWith(view.config);
			view.root.insertAtEnd("A");
			Tree.runTransaction(viewBranch, () => {
				view.root.insertAtEnd("B");
				return Tree.runTransaction.rollback;
			});
			view.root.insertAtEnd("C");
			tree.merge(treeBranch);
			assert.deepEqual(view.root, ["A", "B", "C"]);
		});

		// Disabled because rebases are not supported while a transaction is in progress
		// TODO: enable once ADO#8603 is complete.
		itView(
			"can handle a pull while in progress",
			({ view, tree }) => {
				const treeBranch = tree.branch();
				const viewBranch = treeBranch.viewWith(view.config);
				Tree.runTransaction(viewBranch, () => {
					view.root.insertAtStart("42");
					treeBranch.rebaseOnto(tree);
					assert.equal(viewBranch.root[0], "42");
				});
				assert.equal(viewBranch.root[0], "42");
			},
			{ skip: true },
		);

		itView("update anchors correctly", ({ view }) => {
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
			({ view, tree }) => {
				view.root.insertAtEnd("A");
				Tree.runTransaction(view, () => {
					view.root.insertAtEnd("B");
					view.root.insertAtEnd("C");
					Tree.runTransaction(view, () => {
						view.root.insertAtEnd("D");
					});
					const treeBranch = tree.branch();
					const viewBranch = treeBranch.viewWith(view.config);
					viewBranch.root.insertAtEnd("E");
					Tree.runTransaction(viewBranch, () => {
						viewBranch.root.insertAtEnd("F");
					});
					view.root.insertAtEnd("G");
					viewBranch.root.insertAtEnd("H");
					Tree.runTransaction(viewBranch, () => {
						viewBranch.root.insertAtEnd("I");
						return Tree.runTransaction.rollback;
					});
					tree.merge(treeBranch);
					view.root.insertAtEnd("J");
					Tree.runTransaction(view, () => {
						const treeFork2 = tree.branch();
						const viewFork2 = treeFork2.viewWith(view.config);
						viewFork2.root.insertAtEnd("K");
						viewFork2.root.insertAtEnd("L");
						tree.merge(treeFork2);
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

		itView("dispose branches created during the transaction", ({ view, tree }) => {
			const branchA = tree.branch();
			view.checkout.transaction.start();
			const branchB = tree.branch();
			view.checkout.transaction.start();
			const branchC = tree.branch();
			assert.equal(branchA.disposed, false);
			assert.equal(branchB.disposed, false);
			assert.equal(branchC.disposed, false);
			view.checkout.transaction.abort();
			assert.equal(branchA.disposed, false);
			assert.equal(branchB.disposed, false);
			assert.equal(branchC.disposed, true);
			view.checkout.transaction.commit();
			assert.equal(branchA.disposed, false);
			assert.equal(branchB.disposed, true);
			assert.equal(branchC.disposed, true);
		});

		itView("statuses are reported correctly", ({ view }) => {
			assert.equal(view.checkout.transaction.isInProgress(), false);
			view.checkout.transaction.start();
			assert.equal(view.checkout.transaction.isInProgress(), true);
			view.checkout.transaction.start();
			assert.equal(view.checkout.transaction.isInProgress(), true);
			view.checkout.transaction.commit();
			assert.equal(view.checkout.transaction.isInProgress(), true);
			view.checkout.transaction.abort();
			assert.equal(view.checkout.transaction.isInProgress(), false);
		});
	});

	describe("disposal", () => {
		itView("forks can be disposed", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = treeBranch.viewWith(view.config);
			viewBranch.dispose();
			assert.equal(treeBranch.disposed, true);
		});

		itView("disposed forks cannot be edited or double-disposed", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = treeBranch.viewWith(view.config);
			treeBranch.dispose();
			assert.throws(() => treeBranch.dispose());
			assert.throws(() => viewBranch.root.insertAtStart("A"));
			assert.throws(() => viewBranch.upgradeSchema());
			assert.throws(() => viewBranch.dispose());
		});

		it("views should not be double-disposed on schema upgrade", () => {
			const provider = new TestTreeProviderLite(1);

			// Create and initialize a view.
			const sf1 = new SchemaFactory("schema1");
			const schema1 = sf1.array(sf1.string);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({ schema: schema1, enableSchemaValidation }),
			);
			view1.initialize(["A", "B"]);

			// Dispose the view.
			view1.dispose();

			// Create another view with a new schema using the same checkout as the main view.
			const sf2 = new SchemaFactory("schema1");
			const schema2 = [sf1.array(sf1.string), sf2.array([sf2.string, sf2.number])];
			const view2 = viewCheckout(
				view1.checkout,
				new TreeViewConfiguration({ schema: schema2, enableSchemaValidation }),
			);

			// Upgrading the view should succeed and not dispose the view again.
			assert.doesNotThrow(() => view2.upgradeSchema(), "Upgrading schema should not throw");
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
		const storedSchema1 = toStoredSchema(schema1);
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
		provider.trees[0].checkout.updateSchema(toStoredSchema(sf2.array(sf1.number)));

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
		it("over non-schema changes", () => {
			const provider = new TestTreeProviderLite(1);

			// Create the main view with old schema.
			const sf1 = new SchemaFactory("schema1");
			const oldSchema = sf1.array(sf1.string);
			const oldSchemaConfig = { schema: oldSchema, enableSchemaValidation };
			const tree1 = provider.trees[0];
			const branch1 = getBranch(tree1);
			const view1 = tree1.viewWith(new TreeViewConfiguration(oldSchemaConfig));
			view1.initialize(["A", "B", "C"]);

			// Fork the main branch with new schema.
			const sf2 = new SchemaFactory("schema1");
			const newSchema = [sf2.array(sf2.string), sf2.array([sf2.string, sf2.number])];
			const branch2 = branch1.branch();
			const view2 = branch2.viewWith(
				new TreeViewConfiguration({ schema: newSchema, enableSchemaValidation }),
			);

			// Remove "A" on the parent branch
			view1.root.removeAt(0);

			// Upgrade the schema on the child branch.
			view2.upgradeSchema();

			// Remove "C" on the child branch
			view2.root.removeAt(2);

			assert(view2 instanceof SchematizingSimpleTreeView);
			expectSchemaEqual(toStoredSchema(newSchema), view2.checkout.storedSchema);
			assert.deepEqual(view2.root, ["A", "B"]);

			// Rebase the child branch onto the parent branch.
			branch2.rebaseOnto(branch1);

			// The schema change and any changes after that should be dropped,
			// but the changes before the schema change should be preserved
			expectSchemaEqual(toStoredSchema(oldSchema), view1.checkout.storedSchema);
			assert.deepEqual(view1.root, ["B", "C"]);
		});

		it("over schema changes", () => {
			const provider = new TestTreeProviderLite(1);

			// Create the main branch with old schema.
			const sf1 = new SchemaFactory("schema1");
			const oldSchema = sf1.array(sf1.string);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({ schema: oldSchema, enableSchemaValidation }),
			);
			view1.initialize(["A", "B", "C"]);

			// Remove "A" on the parent branch and dispose the view.
			view1.root.removeAt(0);

			// Get the checkout of the parent branch and fork it before disposing it. The branch is disposed
			// so that a new view can be created from it with a new schema.
			const checkout1 = view1.checkout;
			const checkout2 = view1.checkout.branch();
			view1.dispose();

			// Create a new schema - schema2.
			const sf2 = new SchemaFactory("schema1");
			const schema2 = [sf2.array(sf2.string), sf2.array([sf2.string, sf2.number])];

			// Create a new view with the main branch's checkout and schema2.
			const view2 = viewCheckout(
				checkout1,
				new TreeViewConfiguration({ schema: schema2, enableSchemaValidation }),
			);
			// Upgrade the schema on the new view and remove "B".
			view2.upgradeSchema();
			view2.root.removeAt(1);

			// Create another schema - schema3.
			const sf3 = new SchemaFactory("schema1");
			const schema3 = [sf3.array(sf3.string), sf3.array([sf3.string, sf3.boolean])];

			// Create a new branch view with the forked checkout and schema3.
			const view3 = viewCheckout(
				checkout2,
				new TreeViewConfiguration({ schema: schema3, enableSchemaValidation }),
			);
			// Upgrade the schema on the new view and remove "C".
			view3.upgradeSchema();
			view3.root.removeAt(0);

			expectSchemaEqual(toStoredSchema(schema2), view2.checkout.storedSchema);
			expectSchemaEqual(toStoredSchema(schema3), view3.checkout.storedSchema);

			// Rebase view3 onto view2.
			(view3.checkout as ITreeCheckoutFork).rebaseOnto(view2.checkout);

			// All changes on view3 should be dropped but the schema change and edit in view2 should be preserved.
			expectSchemaEqual(toStoredSchema(schema2), view2.checkout.storedSchema);
			assert.deepEqual(view2.root, ["B"]);
		});
	});

	describe("revertibles", () => {
		itView("can be generated for changes made to the local branch", ({ view }) => {
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe = view.events.on("changed", (_, getRevertible) => {
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
			({ view }) => {
				const revertiblesCreated: Revertible[] = [];

				const unsubscribe = view.events.on("changed", (_, getRevertible) => {
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
			"revertibles cannot be acquired outside of the changed event callback",
			({ view }) => {
				let acquireRevertible: RevertibleFactory | undefined;
				const unsubscribe = view.events.on("changed", (_, getRevertible) => {
					assert(getRevertible !== undefined, "commit should be revertible");
					acquireRevertible = getRevertible;
				});

				view.root.insertAtStart("A");
				assert(acquireRevertible !== undefined);
				assert.throws(() => acquireRevertible?.());
				unsubscribe();
			},
		);

		itView("revertibles cannot be acquired more than once", ({ view }) => {
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe1 = view.events.on("changed", (_, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				const revertible = getRevertible();
				assert.equal(revertible.status, RevertibleStatus.Valid);
				revertiblesCreated.push(revertible);
			});
			const unsubscribe2 = view.events.on("changed", (_, getRevertible) => {
				assert(getRevertible !== undefined, "commit should be revertible");
				assert.throws(() => getRevertible());
			});

			view.root.insertAtStart("A");
			unsubscribe1();
			unsubscribe2();
		});

		itView("disposed revertibles cannot be released or reverted", ({ view }) => {
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe = view.events.on("changed", (_, getRevertible) => {
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

		itView("changed events have the correct commit kinds", ({ view }) => {
			const revertiblesCreated: Revertible[] = [];
			const commitKinds: CommitKind[] = [];
			const unsubscribe = view.events.on("changed", ({ kind }, getRevertible) => {
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

		itView("disposing of a view also disposes of its revertibles", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = asTreeViewAlpha(treeBranch.viewWith(view.config));
			const revertiblesCreated: Revertible[] = [];
			const unsubscribe = viewBranch.events.on("changed", (_, getRevertible) => {
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

			viewBranch.root.insertAtStart("A");

			assert.equal(revertiblesCreated.length, 1);
			assert.equal(revertiblesDisposed.length, 0);

			treeBranch.dispose();

			assert.equal(revertiblesCreated.length, 1);
			assert.equal(revertiblesDisposed.length, 1);
			assert.equal(revertiblesCreated[0], revertiblesDisposed[0]);

			unsubscribe();
		});

		itView("can be reverted after rebasing", ({ view, tree }) => {
			const treeBranch = tree.branch();
			const viewBranch = asTreeViewAlpha(treeBranch.viewWith(view.config));
			viewBranch.root.insertAtStart("A");

			const stacks = createTestUndoRedoStacks(viewBranch.events);
			viewBranch.root.insertAtStart("B");
			viewBranch.root.insertAtStart("C");

			treeBranch.rebaseOnto(tree);

			assert.equal(viewBranch.root[0], "C");
			// It should still be possible to revert the the child branch's revertibles
			assert.equal(stacks.undoStack.length, 2);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			stacks.undoStack.pop()!.revert();
			assert.equal(viewBranch.root[0], "B");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			stacks.undoStack.pop()!.revert();
			assert.equal(viewBranch.root[0], "A");

			stacks.unsubscribe();
		});

		for (const ageToTest of [0, 1, 5]) {
			itView(`Telemetry logs track reversion age (${ageToTest})`, ({ view, logger }) => {
				let revertible: Revertible | undefined;
				const unsubscribe = view.events.on("changed", (_, getRevertible) => {
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

	describe("throws an error if it is in the middle of an edit when a user attempts to", () => {
		const sf = new SchemaFactory("Checkout and view test schema");
		class NumberNode extends sf.object("Number", { number: sf.number }) {}

		/** Tests that an error is thrown when a given action is taken during the execution of a nodeChanged/treeChanged listener */
		function expectErrorDuringEdit(args: {
			/**
			 * Runs after the main view has been created but before the edit occurs
			 * @returns (optionally) a view (e.g. a fork of the main view) that will be passed to `duringEdit`
			 */
			setup?: (
				view: SchematizingSimpleTreeView<typeof NumberNode>,
			) => void | SchematizingSimpleTreeView<typeof NumberNode>;
			/** The code to run during the edit that should throw an error */
			duringEdit: (view: SchematizingSimpleTreeView<typeof NumberNode>) => void;
			/** The expected error message */
			error: string;
		}): void {
			let view = getView(
				new TreeViewConfiguration({ enableSchemaValidation, schema: NumberNode }),
			);

			view.initialize({ number: 3 });
			view = args.setup?.(view) ?? view;

			Tree.on(view.root, "nodeChanged", () => {
				args.duringEdit(view);
			});

			assert.throws(() => (view.root.number = 0), new RegExp(args.error));
		}

		it("edit the tree", () => {
			expectErrorDuringEdit({
				duringEdit: (view) => {
					view.root.number = 4;
				},
				error: "Editing the tree is forbidden during a nodeChanged or treeChanged event",
			});
		});

		it("create a branch", () => {
			expectErrorDuringEdit({
				duringEdit: (view) => view.fork(),
				error: ".*Branching is forbidden during a nodeChanged or treeChanged event.*",
			});
		});

		it("rebase a branch", () => {
			expectErrorDuringEdit({
				duringEdit: (view) => view.rebaseOnto(view),
				error: "Rebasing is forbidden during a nodeChanged or treeChanged event",
			});
		});

		it("merge a branch", () => {
			expectErrorDuringEdit({
				duringEdit: (view) => view.merge(view),
				error: "Merging is forbidden during a nodeChanged or treeChanged event",
			});
		});

		it("dispose", () => {
			let branch: TreeBranch | undefined;
			expectErrorDuringEdit({
				setup: (view) => (branch = view.fork()), // Create a fork of the view because the main view can't be disposed
				duringEdit: (view) => view.dispose(),
				error: "Disposing a view is forbidden during a nodeChanged or treeChanged event",
			});
		});
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
	fn: (args: {
		view: SchematizingSimpleTreeView<TRootSchema>;
		tree: BranchableTree;
		logger: IMockLoggerExt;
	}) => void,
	options: {
		initialContent: { schema: TRootSchema; initialTree: T };
		skip?: true;
	},
): void;
function itView(
	title: string,
	fn: (args: {
		view: SchematizingSimpleTreeView<typeof rootArray>;
		tree: BranchableTree;
		logger: IMockLoggerExt;
	}) => void,
	options?: {
		skip?: true;
	},
): void;
function itView<
	T extends InsertableField<TRootSchema>,
	TRootSchema extends ImplicitFieldSchema = typeof rootArray,
>(
	title: string,
	fn: (args: {
		view: SchematizingSimpleTreeView<TRootSchema>;
		tree: BranchableTree;
		logger: IMockLoggerExt;
	}) => void,
	options: {
		initialContent?: { schema: TRootSchema; initialTree: T };
		skip?: true;
	} = {},
): void {
	const itFunction = options.skip === true ? it.skip.bind(it) : it;

	function callWithView(
		thunk: typeof fn,
		makeViewFromConfig: (config: TreeViewConfiguration<TRootSchema>) => {
			view: SchematizingSimpleTreeView<TRootSchema>;
			tree: BranchableTree;
			logger: IMockLoggerExt;
		},
	): void {
		if (options.initialContent) {
			const { logger } = new TestTreeProviderLite();
			const { view, tree } = makeViewFromConfig(
				new TreeViewConfiguration({
					schema: options.initialContent.schema,
					enableSchemaValidation,
				}),
			);
			view.initialize(options.initialContent.initialTree);
			thunk({ view, tree, logger });
		} else {
			const { view, tree, logger } = (
				makeViewFromConfig as unknown as (config: TreeViewConfiguration<typeof rootArray>) => {
					view: SchematizingSimpleTreeView<typeof rootArray>;
					tree: BranchableTree;
					logger: IMockLoggerExt;
				}
			)(
				new TreeViewConfiguration({
					schema: rootArray,
					enableSchemaValidation,
				}),
			);
			view.initialize([]);
			// down cast here is safe due to overload protections
			(
				thunk as unknown as (args: {
					view: SchematizingSimpleTreeView<typeof rootArray>;
					tree: BranchableTree;
					logger: IMockLoggerExt;
				}) => void
			)({ view, tree, logger });
		}
	}

	function makeReferenceView(
		config: TreeViewConfiguration<TRootSchema>,
		fork: boolean,
	): {
		view: SchematizingSimpleTreeView<TRootSchema>;
		tree: BranchableTree;
		logger: IMockLoggerExt;
	} {
		const logger = createMockLoggerExt();
		const view = getView(config, undefined, logger);
		if (fork) {
			const treeBranch = getBranch(view).branch();
			const viewBranch = treeBranch.viewWith(view.config);
			assert(viewBranch instanceof SchematizingSimpleTreeView);
			return { view: viewBranch, tree: treeBranch, logger };
		} else {
			return {
				view,
				tree: getBranch(view),
				logger,
			};
		}
	}

	itFunction(`${title} (root view)`, () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const branch = getBranch(tree);
		callWithView(fn, (config) => ({
			view: tree.viewWith(config),
			tree: branch,
			logger: provider.logger,
		}));
	});

	itFunction(`${title} (reference view)`, () => {
		callWithView(fn, (config) => makeReferenceView(config, false));
	});

	itFunction(`${title} (forked view)`, () => {
		const provider = new TestTreeProviderLite();
		const [tree] = provider.trees;
		const branch = getBranch(tree).branch();
		callWithView(fn, (config) => {
			const view = branch.viewWith(config);
			assert(view instanceof SchematizingSimpleTreeView);
			return { view, tree: branch, logger: provider.logger };
		});
	});

	itFunction(`${title} (reference forked view)`, () => {
		callWithView(fn, (config) => makeReferenceView(config, true));
	});
}

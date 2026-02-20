/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockHandle, validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../api.js";
import { TreeStatus } from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { runTransaction, Tree } from "../../shared-tree/tree.js";
// Including tests for TreeAlpha here so they don't have to move if/when stabilized
// eslint-disable-next-line import-x/no-internal-modules
import { TreeAlpha } from "../../shared-tree/treeAlpha.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
	type TreeView,
	type InsertableTypedNode,
	type TreeNodeSchema,
	type NodeFromSchema,
	type TreeViewAlpha,
	type TransactionConstraint,
	type rollback,
} from "../../simple-tree/index.js";
import type { requireAssignableTo } from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { hydrate } from "../simple-tree/utils.js";
import { TestTreeProviderLite, createTestUndoRedoStacks, getView } from "../utils.js";

describe("treeApi", () => {
	describe("runTransaction", () => {
		const schemaFactory = new SchemaFactory(undefined);
		class ChildObject extends schemaFactory.object("ChildObject", {}) {}
		class TestObject extends schemaFactory.object("TestObject", {
			content: schemaFactory.number,
			child: schemaFactory.optional(ChildObject),
		}) {}

		function getTestObjectView(child?: InsertableTypedNode<typeof ChildObject>) {
			const view = getView(new TreeViewConfiguration({ schema: TestObject }));
			view.initialize({
				content: 42,
				child,
			});
			return view;
		}

		describe("runTransaction API", () => {
			/**
			 * Runs a set of transaction tests, either passing the TreeView or the root node to the `runTransaction` function depending on the configuration.
			 * @remarks This allows for code coverage of both of those variants of the `runTransaction` API without duplicating these tests entirely.
			 */
			function runCommonTransactionTests(inputType: "view" | "root"): void {
				function run<TResult>(
					view: TreeView<typeof TestObject>,
					transaction: (root: TestObject) => TResult | typeof rollback,
					preconditions?: TransactionConstraint[],
				) {
					return runTransaction(
						inputType === "view" ? view : view.root,
						transaction,
						preconditions,
					);
				}

				it("passes root to transaction function", () => {
					const view = getTestObjectView();
					run(view, (root: TestObject) => {
						assert.equal(root, view.root);
					});
				});

				it("runs transactions", () => {
					const view = getTestObjectView();
					run(view, (root) => {
						root.content = 43;
					});
					assert.equal(view.root.content, 43);
				});

				it("can be rolled back", () => {
					const view = getTestObjectView();
					run(view, (root) => {
						root.content = 43;
						return Tree.runTransaction.rollback;
					});
					assert.equal(view.root.content, 42);
				});

				it("rolls back transactions on error", () => {
					const view = getTestObjectView();
					try {
						run(view, (root) => {
							root.content = 43;
							throw new Error("Oh no");
						});
					} catch (error) {
						assert(error instanceof Error);
						assert.equal(error.message, "Oh no");
					}
					assert.equal(view.root.content, 42);
				});

				it("undoes and redoes entire transaction", () => {
					const view = getTestObjectView();

					const { undoStack, redoStack } = createTestUndoRedoStacks(view.checkout.events);

					run(view, (root) => {
						root.content = 43;
						root.content = 44;
					});
					assert.equal(view.root.content, 44);
					assert.equal(undoStack.length, 1);
					undoStack[0].revert();
					assert.equal(view.root.content, 42);
					assert.equal(redoStack.length, 1);
					redoStack[0].revert();
					assert.equal(view.root.content, 44);
				});

				it("fails if node existence constraint is already violated", () => {
					const view = getTestObjectView({});
					const childB = view.root.child;
					assert(childB !== undefined);
					// The node given to the constraint is deleted from the document, so the transaction can't possibly succeed even locally/optimistically
					view.root.child = undefined;
					assert.throws(() => {
						run(
							view,
							(root) => {
								root.content = 43;
							},
							[{ type: "nodeInDocument", node: childB }],
						);
					});
					assert.equal(view.root.content, 42);
				});

				it("respects a violated node existence constraint after sequencing", () => {
					// Create two connected trees with child nodes
					const config = new TreeViewConfiguration({ schema: TestObject });
					const provider = new TestTreeProviderLite(2);
					const [treeA, treeB] = provider.trees;
					const viewA = treeA.viewWith(config);
					const viewB = treeB.viewWith(config);
					viewA.initialize({
						content: 42,
						child: {},
					});
					provider.synchronizeMessages();

					// Tree A removes the child node (this will be sequenced before anything else because the provider sequences ops in the order of submission).
					viewA.root.child = undefined;
					// Tree B runs a transaction to change the root content to 43, but it should only succeed if the child node exists.
					const childB = viewB.root.child;
					assert(childB !== undefined);
					run(
						viewB,
						(root) => {
							root.content = 43;
						},
						[{ type: "nodeInDocument", node: childB }],
					);
					// The transaction does apply optimistically...
					assert.equal(viewA.root.content, 42);
					assert.equal(viewB.root.content, 43);
					// ...but then is rolled back after sequencing because the child node was removed by Tree A.
					provider.synchronizeMessages();
					assert.equal(viewB.root.content, 42);
					assert.equal(viewB.root.content, 42);
				});
			}

			describe("invoked by passing a tree view", () => {
				runCommonTransactionTests("view");

				it("returns the correct result", () => {
					const view = getTestObjectView();
					{
						// Returns a result
						const result = Tree.runTransaction(view, () => 43);
						type _ = requireAssignableTo<typeof result, number>;
						assert.equal(result, 43);
					}
					{
						// Returns the special rollback value
						const result = Tree.runTransaction(view, () => Tree.runTransaction.rollback);
						type _ = requireAssignableTo<typeof result, symbol>;
						assert.equal(result, Tree.runTransaction.rollback);
					}
					{
						// Returns either a result or the special rollback value
						const result = Tree.runTransaction(view, () =>
							Math.random() >= 0.5 ? Tree.runTransaction.rollback : 43,
						);
						if (result === Tree.runTransaction.rollback) {
							type _ = requireAssignableTo<typeof result, typeof Tree.runTransaction.rollback>;
						} else {
							type _ = requireAssignableTo<typeof result, number>;
						}
					}
					{
						// Returns some symbol or the special rollback value
						const otherSymbol = Symbol();
						const result = Tree.runTransaction(view, () =>
							Math.random() >= 0.5 ? Tree.runTransaction.rollback : otherSymbol,
						);
						if (result === Tree.runTransaction.rollback) {
							type _ = requireAssignableTo<typeof result, typeof Tree.runTransaction.rollback>;
						} else {
							type _ = requireAssignableTo<typeof result, typeof otherSymbol>;
						}
					}
				});

				// TODO: Either enable when afterBatch is implemented, or delete if no longer relevant
				it.skip("emits change events", () => {
					const view = getTestObjectView();
					let eventCount = 0;
					view.events.on("rootChanged", () => (eventCount += 1));
					view.root.content = 44;
					assert.equal(eventCount, 1);
					Tree.runTransaction(view, (root) => {
						root.content = 43;
					});
					assert.equal(eventCount, 2);
				});

				it.skip("emits change events on rollback", () => {
					const view = getTestObjectView();
					let eventCount = 0;
					view.events.on("rootChanged", () => (eventCount += 1));
					Tree.runTransaction(view, (r) => {
						r.content = 43;
						assert.equal(eventCount, 1);
						return Tree.runTransaction.rollback;
					});
					assert.equal(eventCount, 2);
				});

				describe("unhydrated", () => {
					it("transaction on unhydrated throws", () => {
						assert.throws(
							() => {
								Tree.runTransaction(new ChildObject({}), (r) => {});
							},
							validateUsageError(/Transactions cannot be run on Unhydrated nodes/),
						);
					});

					it("transaction on view modifies unhydrated - not rolled back", () => {
						const view = getTestObjectView();
						const node = new TestObject({ content: 5 });
						Tree.runTransaction(view, (root) => {
							node.content = 6;
							return Tree.runTransaction.rollback;
						});
						// Changes to other tree, and unhydrated nodes are not rolled back.
						assert.equal(node.content, 6);
					});
				});
			});

			describe("schema", () => {
				it("leaf", () => {
					assert.equal(Tree.schema(null), schemaFactory.null);
					assert.equal(Tree.schema(0), schemaFactory.number);
					assert.equal(Tree.schema(false), schemaFactory.boolean);
					assert.equal(Tree.schema(""), schemaFactory.string);
					assert.equal(Tree.schema(new MockHandle(0)), schemaFactory.handle);

					// Inferring the node type from the node in Tree.schema can incorrectly over-narrow.
					// Ensure this does not happen:
					const schema = Tree.schema(0);
					type _check1 = requireAssignableTo<2, NodeFromSchema<typeof schema>>;
				});

				it("node", () => {
					class Test extends schemaFactory.object("Test", {}) {}

					const schema: TreeNodeSchema = Tree.schema(new Test({}));
					assert.equal(schema, Test);
				});
			});

			describe("invoked by passing a node", () => {
				runCommonTransactionTests("view");

				it("returns the correct result", () => {
					const { root } = getTestObjectView();
					{
						// Returns a result
						const result = Tree.runTransaction(root, () => 43);
						type _ = requireAssignableTo<typeof result, number>;
						assert.equal(result, 43);
					}
					{
						// Returns the special rollback value
						const result = Tree.runTransaction(root, () => Tree.runTransaction.rollback);
						type _ = requireAssignableTo<typeof result, symbol>;
						assert.equal(result, Tree.runTransaction.rollback);
					}
					{
						// Returns either a result or the special rollback value
						const result = Tree.runTransaction(root, () =>
							Math.random() >= 0.5 ? Tree.runTransaction.rollback : 43,
						);
						if (result === Tree.runTransaction.rollback) {
							type _ = requireAssignableTo<typeof result, typeof Tree.runTransaction.rollback>;
						} else {
							type _ = requireAssignableTo<typeof result, number>;
						}
					}
					{
						// Returns some symbol or the special rollback value
						const otherSymbol = Symbol();
						const result = Tree.runTransaction(root, () =>
							Math.random() >= 0.5 ? Tree.runTransaction.rollback : otherSymbol,
						);
						if (result === Tree.runTransaction.rollback) {
							type _ = requireAssignableTo<typeof result, typeof Tree.runTransaction.rollback>;
						} else {
							type _ = requireAssignableTo<typeof result, typeof otherSymbol>;
						}
					}
				});

				it("emits change events", () => {
					const { root } = getTestObjectView();
					let deepEvent = false;
					let shallowEvent = false;
					Tree.on(root, "nodeChanged", () => (shallowEvent = true));
					Tree.on(root, "treeChanged", () => (deepEvent = true));
					Tree.runTransaction(root, (r) => {
						r.content = 43;
					});
					assert.equal(shallowEvent, true);
					assert.equal(deepEvent, true);
				});

				it("emits change events on rollback", () => {
					const { root } = getTestObjectView();
					let deepEventCount = 0;
					let shallowEventCount = 0;
					Tree.on(root, "nodeChanged", () => (shallowEventCount += 1));
					Tree.on(root, "treeChanged", () => (deepEventCount += 1));
					Tree.runTransaction(root, (r) => {
						r.content = 43;
						return Tree.runTransaction.rollback;
					});
					// One firing of events during the initial change and another during rollback, plus 'treeChanged' fires twice
					// each time (detach and attach passes).
					assert.equal(shallowEventCount, 2);
					assert.equal(deepEventCount, 2);
				});

				// TODO: When SchematizingSimpleTreeView supports forking, add test coverage to ensure that transactions work properly on forks
			});
		});
	});

	it("contains", () => {
		const schemaFactory = new SchemaFactory(undefined);
		class Node extends schemaFactory.objectRecursive("Node", {
			child: schemaFactory.optionalRecursive([() => Node]),
		}) {}
		{
			type _check = ValidateRecursiveSchema<typeof Node>;
		}

		const level1 = hydrate(
			Node,
			new Node({ child: new Node({ child: new Node({ child: undefined }) }) }),
		);

		const level2 = level1.child ?? assert.fail();
		const level3 = level2.child ?? assert.fail();

		// equal case
		assert(Tree.contains(level1, level1));
		// direct child
		assert(Tree.contains(level1, level2));
		// indirect child
		assert(Tree.contains(level1, level3));

		// non-root
		assert(Tree.contains(level2, level3));

		// false cases
		assert.equal(Tree.contains(level3, level1), false);
		assert.equal(Tree.contains(level3, level2), false);
		assert.equal(Tree.contains(level2, level1), false);
	});

	it("context", () => {
		const schemaFactory = new SchemaFactory(undefined);
		class ArrayNode extends schemaFactory.array("array", schemaFactory.number) {}
		const view = getView(
			new TreeViewConfiguration({ schema: ArrayNode, enableSchemaValidation: true }),
		);
		view.initialize([1, 2, 3]);

		// Hydrated
		const array = view.root;
		const context = TreeAlpha.branch(array);
		assert(context !== undefined);

		// Unhydrated
		assert.equal(TreeAlpha.branch(new ArrayNode([1, 2, 3])), undefined);
	});

	it("parent2", () => {
		const schemaFactory = new SchemaFactory(undefined);
		class ChildNode extends schemaFactory.object("ChildNode", {
			value: schemaFactory.number,
		}) {}
		class ParentNode extends schemaFactory.object("ParentNode", {
			child: ChildNode,
		}) {}

		const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
		view.initialize({ child: { value: 1 } });

		const root = view.root;
		const child = root.child;

		// For a non-root node, parent2 should return the parent TreeNode
		const childParent = TreeAlpha.parent2(child);
		assert.equal(childParent, root);
		assert(Tree.is(childParent, ParentNode));

		// For the root node, parent2 should return a RootParent (not a TreeNode)
		const rootParent = TreeAlpha.parent2(root);
		assert.notEqual(rootParent, root, "rootParent should not be the root node");
		assert.equal((rootParent as { type: string }).type, "root");
	});

	describe("on", () => {
		it("works with both TreeNode and RootParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class ChildNode extends schemaFactory.object("ChildNode", {
				value: schemaFactory.number,
			}) {}
			class ParentNode extends schemaFactory.object("ParentNode", {
				child: ChildNode,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
			view.initialize({ child: { value: 1 } });

			const root = view.root;
			const child = root.child;

			// Get the RootParent for the root node
			const rootParent = TreeAlpha.parent2(root);
			assert(!Tree.is(rootParent, ParentNode), "rootParent should not be a TreeNode");
			assert.equal((rootParent as { type: string }).type, "root");

			// Set up event listeners.

			// nodeChanged using a TreeNode
			let childNodeChangedCount = 0;
			const unsubscribeChildNodeChanged = TreeAlpha.on(child, "nodeChanged", () => {
				childNodeChangedCount++;
			});

			// nodeChanged using a RootParent
			let rootNodeChangedCount = 0;
			const unsubscribeRootNodeChanged = TreeAlpha.on(rootParent, "nodeChanged", () => {
				rootNodeChangedCount++;
			});

			// treeChanged using a RootParent
			let rootTreeChangedCount = 0;
			const unsubscribeRootTreeChanged = TreeAlpha.on(rootParent, "treeChanged", () => {
				rootTreeChangedCount++;
			});

			// Modify the child node's value (deep change)
			child.value = 2;
			assert.equal(childNodeChangedCount, 1, "childNodeChanged should have fired once");
			assert.equal(
				rootNodeChangedCount,
				0,
				"nodeChanged on root node should not fire for deep changes",
			);
			assert.equal(rootTreeChangedCount, 1, "rootTreeChanged should fire for deep changes");

			// Unsubscribe and verify no more events are received
			unsubscribeChildNodeChanged();
			// Modify the child (still in document) to verify unsubscribe worked
			child.value = 44;
			assert.equal(
				childNodeChangedCount,
				1,
				"childNodeChanged should not fire after unsubscribe",
			);

			// Modify the root node's child property (shallow change)
			root.child = new ChildNode({ value: 3 });
			assert.equal(
				rootNodeChangedCount,
				1,
				"nodeChanged on root node should fire for shallow changes",
			);
			assert.equal(
				rootTreeChangedCount,
				3,
				"rootTreeChanged should fire after root property change",
			);

			unsubscribeRootNodeChanged();
			unsubscribeRootTreeChanged();
		});

		it("treeChanged on RootParent handles root node changes", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class ChildNode extends schemaFactory.object("ChildNode", {
				value: schemaFactory.number,
			}) {}

			// Set up a TreeView with a required root field.
			const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
			view.initialize({ value: 1 });

			// Get the RootParent via parent2
			const root = view.root;
			const rootParent = TreeAlpha.parent2(root);
			assert(!Tree.is(rootParent, ChildNode), "rootParent should not be a TreeNode");

			// Listen to treeChanged on the RootParent
			let treeChangedCount = 0;
			const unsubscribeTreeChanged = TreeAlpha.on(rootParent, "treeChanged", () => {
				treeChangedCount++;
			});

			// Modify the root node
			root.value = 2;

			// treeChanged should fire for changes within the root node
			assert.equal(treeChangedCount, 1, "treeChanged should fire for changes in root");

			// Clean up
			unsubscribeTreeChanged();
		});

		it("on() method with nodeChanged/treeChanged works with RootParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Node extends schemaFactory.object("Node", {
				value: schemaFactory.number,
			}) {}

			// Create a view with a specific schema
			const view = getView(new TreeViewConfiguration({ schema: Node }));
			view.initialize({ value: 42 });

			// Get the RootParent via parent2
			const root = view.root;
			const rootParent = TreeAlpha.parent2(root);

			// Verify the schema is compatible
			assert.equal(
				view.compatibility.canView,
				true,
				"Test setup: schema should be compatible",
			);

			// When the view schema is compatible, on() should succeed
			let eventFired = false;
			const unsubscribe = TreeAlpha.on(rootParent, "treeChanged", () => {
				eventFired = true;
			});

			// Make a change to verify the listener works
			root.value = 50;
			assert.equal(eventFired, true, "listener should fire when schema is compatible");

			// Clean up
			unsubscribe();
		});

		it("treeChanged properly handles rebase operations", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class ChildNode extends schemaFactory.object("ChildNode", {
				value: schemaFactory.number,
			}) {}
			class RootNode extends schemaFactory.object("RootNode", {
				child: ChildNode,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: RootNode }));
			view.initialize({ child: { value: 1 } });

			const forkedView = view.fork();

			// Get the RootParent from the forked view's root
			const forkRootParent = TreeAlpha.parent2(forkedView.root);

			// Set up event listener on the forked branch before making changes
			let forkTreeChangedCount = 0;
			const unsubscribeForkTreeChanged = TreeAlpha.on(forkRootParent, "treeChanged", () => {
				forkTreeChangedCount++;
			});

			// Make a change on the forked branch
			forkedView.root.child.value = 2;
			assert.equal(forkTreeChangedCount, 1, "fork listener should fire for changes on fork");

			// Make changes on the main branch
			view.root.child.value = 3;
			assert.equal(forkTreeChangedCount, 1, "fork should not receive main branch changes");

			// Rebase the fork onto the main branch
			forkedView.rebaseOnto(view);
			assert.equal(
				forkedView.root.child.value,
				2,
				"fork should retain its changes after rebase",
			);

			// Check that listener still works after rebase
			forkedView.root.child.value = 150;
			assert.equal(forkTreeChangedCount, 2, "fork listener should still work after rebase");

			unsubscribeForkTreeChanged();
		});

		it("treeChanged fires when root is replaced during rebase", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class ChildNode extends schemaFactory.object("ChildNode", {
				value: schemaFactory.number,
			}) {}
			class RootNode extends schemaFactory.object("RootNode", {
				child: ChildNode,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: RootNode }));
			view.initialize({ child: { value: 42 } });

			const forkedView = view.fork();

			// Get the RootParent from the forked view's root
			const forkRootParent = TreeAlpha.parent2(forkedView.root);

			// Set up event listener on the forked branch
			let forkTreeChangedCount = 0;
			const unsubscribeForkTreeChanged = TreeAlpha.on(forkRootParent, "treeChanged", () => {
				forkTreeChangedCount++;
			});

			// Make a change on the forked branch
			forkedView.root.child.value = 50;
			assert.equal(forkTreeChangedCount, 1, "listener fires for change on fork");

			// Replace root node on main branch
			view.root = new RootNode({ child: { value: 100 } });
			assert.equal(
				forkTreeChangedCount,
				1,
				"listener does not fire for main branch root replacement",
			);

			// Rebase the fork onto the main branch
			forkedView.rebaseOnto(view);
			// Check that listener fires due to root replacement during rebase, and has correct new root
			assert.equal(
				forkTreeChangedCount,
				2,
				"listener fires when root is replaced during rebase",
			);
			assert.equal(forkedView.root.child.value, 100, "fork has new root after rebase");

			// Make another change to verify listener still works after rebase
			forkedView.root.child.value = 200;
			assert.equal(forkTreeChangedCount, 3, "listener still works after root replacement");

			unsubscribeForkTreeChanged();
		});

		describe("DetachedParent", () => {
			it("returns DetachedParent for removed node", () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Item extends schemaFactory.object("Item", {
					value: schemaFactory.number,
				}) {}
				class Container extends schemaFactory.object("Container", {
					items: schemaFactory.array(Item),
				}) {}

				const view = getView(new TreeViewConfiguration({ schema: Container }));
				view.initialize({ items: [{ value: 1 }, { value: 2 }] });

				// Get a reference to the first item before removing it
				const item = view.root.items[0];
				assert.notEqual(item, undefined);
				assert.equal(Tree.status(item), TreeStatus.InDocument);

				// Remove the item from the array (this makes it detached)
				view.root.items.removeAt(0);
				assert.equal(Tree.status(item), TreeStatus.Removed);

				// Get the parent2 which should now be DetachedParent
				const parent = TreeAlpha.parent2(item);
				assert.notEqual(parent, undefined);
				assert(!Tree.is(parent, Item), "parent should not be a TreeNode");
				assert.equal((parent as { type: string }).type, "detached");
			});

			it("can subscribe to events on DetachedParent", () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Item extends schemaFactory.object("Item", {
					value: schemaFactory.number,
				}) {}
				class Container extends schemaFactory.object("Container", {
					items: schemaFactory.array(Item),
				}) {}

				const view = getView(new TreeViewConfiguration({ schema: Container }));
				view.initialize({ items: [{ value: 10 }] });

				const item = view.root.items[0];
				assert.notEqual(item, undefined);

				// Remove the item
				view.root.items.removeAt(0);
				assert.equal(Tree.status(item), TreeStatus.Removed);

				// Get the DetachedParent
				const parent = TreeAlpha.parent2(item);
				assert.equal((parent as { type: string }).type, "detached");

				// Subscribe to events on the DetachedParent - this should not throw
				const unsubscribeTc = TreeAlpha.on(parent, "treeChanged", () => {});
				const unsubscribeNc = TreeAlpha.on(parent, "nodeChanged", () => {});

				// Clean up
				unsubscribeTc();
				unsubscribeNc();
			});

			it("detects status change when node is re-attached via undo", () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Item extends schemaFactory.object("Item", {
					value: schemaFactory.number,
				}) {}
				class Container extends schemaFactory.object("Container", {
					items: schemaFactory.array(Item),
				}) {}

				const view = getView(new TreeViewConfiguration({ schema: Container }));
				view.initialize({ items: [{ value: 42 }] });

				// Set up undo/redo stacks
				const undoRedoStacks = createTestUndoRedoStacks(view.events);

				// Get a reference to the item before removing it
				const item = view.root.items[0];
				assert.notEqual(item, undefined);
				assert.equal(Tree.status(item), TreeStatus.InDocument);

				// Remove the item (this creates a revertible)
				view.root.items.removeAt(0);
				assert.equal(Tree.status(item), TreeStatus.Removed);

				// Get the DetachedParent AFTER removal
				const parent = TreeAlpha.parent2(item);
				assert.equal((parent as { type: string }).type, "detached");

				// Subscribe to nodeChanged on the DetachedParent
				let eventCount = 0;
				const unsubscribe = TreeAlpha.on(parent, "nodeChanged", () => {
					eventCount++;
				});

				// Undo the removal (this should re-attach the node)
				const revertible = undoRedoStacks.undoStack.pop();
				assert.notEqual(revertible, undefined);
				revertible?.revert();

				// Node should now be back in the document
				assert.equal(Tree.status(item), TreeStatus.InDocument);

				// Verify the event fired when the node was re-attached
				assert.equal(eventCount, 1, "event should fire when node is re-attached via undo");

				// Verify the parent2 now returns the array (a TreeNode), not DetachedParent
				const newParent = TreeAlpha.parent2(item);
				// After re-attachment, the parent should be the items array (a TreeNode)
				assert.equal(newParent, view.root.items);

				unsubscribe();
				undoRedoStacks.unsubscribe();
			});
		});

		describe("UnhydratedParent", () => {
			it("returns UnhydratedParent for new node", () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Item extends schemaFactory.object("Item", {
					value: schemaFactory.number,
				}) {}

				// Create an unhydrated node
				const item = new Item({ value: 42 });
				assert.equal(Tree.status(item), TreeStatus.New);

				// Get the parent2 which should be UnhydratedParent
				const parent = TreeAlpha.parent2(item);
				assert.notEqual(parent, undefined);
				assert(!Tree.is(parent, Item), "parent should not be a TreeNode");
				assert.equal((parent as { type: string }).type, "unhydrated");
			});

			it("can subscribe to events on UnhydratedParent", () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Item extends schemaFactory.object("Item", {
					value: schemaFactory.number,
				}) {}

				// Create an unhydrated node
				const item = new Item({ value: 100 });
				assert.equal(Tree.status(item), TreeStatus.New);

				// Get the UnhydratedParent
				const parent = TreeAlpha.parent2(item);
				assert.equal((parent as { type: string }).type, "unhydrated");

				// Subscribe to events on the UnhydratedParent - this should not throw
				const unsubscribeTc = TreeAlpha.on(parent, "treeChanged", () => {});
				const unsubscribeNc = TreeAlpha.on(parent, "nodeChanged", () => {});

				// Clean up
				unsubscribeTc();
				unsubscribeNc();
			});

			it("returns parent TreeNode for nested unhydrated child", () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Child extends schemaFactory.object("Child", {
					value: schemaFactory.number,
				}) {}
				class ParentNode extends schemaFactory.object("Parent", {
					child: Child,
				}) {}

				// Create an unhydrated parent with an unhydrated child
				const parentNode = new ParentNode({ child: { value: 5 } });
				const child = parentNode.child;
				assert.equal(Tree.status(child), TreeStatus.New);

				// For a child of an unhydrated parent, parent2 should return the parent TreeNode
				const childParent = TreeAlpha.parent2(child);
				// The parent is another TreeNode, not a ParentObject
				assert.equal(childParent, parentNode);
			});

			it("fires status change event when unhydrated node becomes hydrated", async () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Item extends schemaFactory.object("Item", {
					value: schemaFactory.number,
				}) {}

				// Create an unhydrated node
				const item = new Item({ value: 42 });
				assert.equal(Tree.status(item), TreeStatus.New);

				// Get the UnhydratedParent
				const parent = TreeAlpha.parent2(item);
				assert.equal((parent as { type: string }).type, "unhydrated");

				// Subscribe to treeChanged on the UnhydratedParent
				let eventCount = 0;
				const unsubscribe = TreeAlpha.on(parent, "treeChanged", () => {
					eventCount++;
				});

				// Hydrate the node by inserting it into a view
				const view = getView(new TreeViewConfiguration({ schema: Item }));
				view.initialize(item);

				// Node should now be in the document
				assert.equal(Tree.status(item), TreeStatus.InDocument);

				// The status change event fires via microtask, so we need to wait
				await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

				// The event should have fired because the node's status changed
				assert.equal(eventCount, 1, "event should fire when unhydrated node becomes hydrated");

				unsubscribe();
			});

			it("fires status change event for nested unhydrated nodes", async () => {
				const schemaFactory = new SchemaFactory(undefined);
				class Child extends schemaFactory.object("Child", {
					value: schemaFactory.number,
				}) {}
				class ParentNode extends schemaFactory.object("Parent", {
					child: Child,
				}) {}

				// Create an unhydrated parent with an unhydrated child
				const parentNode = new ParentNode({ child: { value: 5 } });
				const child = parentNode.child;
				assert.equal(Tree.status(parentNode), TreeStatus.New);
				assert.equal(Tree.status(child), TreeStatus.New);

				// Get the UnhydratedParent for the root parent node
				const rootParent = TreeAlpha.parent2(parentNode);
				assert.equal((rootParent as { type: string }).type, "unhydrated");

				// Subscribe to treeChanged on the root's UnhydratedParent
				let eventCount = 0;
				const unsubscribe = TreeAlpha.on(rootParent, "treeChanged", () => {
					eventCount++;
				});

				// Hydrate by inserting the parent
				const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
				view.initialize(parentNode);

				// Both should be hydrated now
				assert.equal(Tree.status(parentNode), TreeStatus.InDocument);
				assert.equal(Tree.status(child), TreeStatus.InDocument);

				// Wait for the microtask
				await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

				// Event should have fired for the parent node's status change
				assert.equal(eventCount, 1, "event should fire when parent node becomes hydrated");

				unsubscribe();
			});
		});
	});

	describe("child", () => {
		it("works with RootParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Node extends schemaFactory.object("Node", {
				value: schemaFactory.number,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: Node }));
			view.initialize({ value: 42 });

			const root = view.root;
			const rootParent = TreeAlpha.parent2(root);
			assert.equal((rootParent as { type: string }).type, "root");

			// child with undefined key should return the root node
			const child = TreeAlpha.child(rootParent, undefined);
			assert.equal(child, root);

			// child with non-undefined key should return undefined
			const invalidChild = TreeAlpha.child(rootParent, "foo");
			assert.equal(invalidChild, undefined);
		});

		it("works with DetachedParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Item extends schemaFactory.object("Item", {
				value: schemaFactory.number,
			}) {}
			class Container extends schemaFactory.object("Container", {
				items: schemaFactory.array(Item),
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });

			// Remove the item to make it detached
			const item = view.root.items[0];
			assert.notEqual(item, undefined);
			view.root.items.removeAt(0);

			const detachedParent = TreeAlpha.parent2(item);
			assert.equal((detachedParent as { type: string }).type, "detached");

			// child with undefined key should return the detached node
			const child = TreeAlpha.child(detachedParent, undefined);
			assert.equal(child, item);
		});

		it("works with UnhydratedParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Item extends schemaFactory.object("Item", {
				value: schemaFactory.number,
			}) {}

			const item = new Item({ value: 42 });
			const unhydratedParent = TreeAlpha.parent2(item);
			assert.equal((unhydratedParent as { type: string }).type, "unhydrated");

			// child with undefined key should return the unhydrated node
			const child = TreeAlpha.child(unhydratedParent, undefined);
			assert.equal(child, item);
		});
	});

	describe("children", () => {
		it("works with RootParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Node extends schemaFactory.object("Node", {
				value: schemaFactory.number,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: Node }));
			view.initialize({ value: 42 });

			const root = view.root;
			const rootParent = TreeAlpha.parent2(root);

			const childrenResult = [...TreeAlpha.children(rootParent)];
			assert.equal(childrenResult.length, 1);
			assert.equal(childrenResult[0][0], undefined);
			assert.equal(childrenResult[0][1], root);
		});

		it("works with DetachedParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Item extends schemaFactory.object("Item", {
				value: schemaFactory.number,
			}) {}
			class Container extends schemaFactory.object("Container", {
				items: schemaFactory.array(Item),
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });

			const item = view.root.items[0];
			assert.notEqual(item, undefined);
			view.root.items.removeAt(0);

			const detachedParent = TreeAlpha.parent2(item);
			const childrenResult = [...TreeAlpha.children(detachedParent)];
			assert.equal(childrenResult.length, 1);
			assert.equal(childrenResult[0][0], undefined);
			assert.equal(childrenResult[0][1], item);
		});

		it("works with UnhydratedParent", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Item extends schemaFactory.object("Item", {
				value: schemaFactory.number,
			}) {}

			const item = new Item({ value: 42 });
			const unhydratedParent = TreeAlpha.parent2(item);

			const childrenResult = [...TreeAlpha.children(unhydratedParent)];
			assert.equal(childrenResult.length, 1);
			assert.equal(childrenResult[0][0], undefined);
			assert.equal(childrenResult[0][1], item);
		});
	});

	describe("parent2/key2/child invariant", () => {
		it("holds for root nodes", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Node extends schemaFactory.object("Node", {
				value: schemaFactory.number,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: Node }));
			view.initialize({ value: 42 });

			const root = view.root;
			const parent = TreeAlpha.parent2(root);
			const key = TreeAlpha.key2(root);

			assert.equal(key, undefined, "key2 should return undefined for root nodes");
			assert.equal(
				TreeAlpha.child(parent, key),
				root,
				"child(parent2(node), key2(node)) should equal node",
			);
		});

		it("holds for nested nodes", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Child extends schemaFactory.object("Child", {
				value: schemaFactory.number,
			}) {}
			class Parent extends schemaFactory.object("Parent", {
				child: Child,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: Parent }));
			view.initialize({ child: { value: 42 } });

			const child = view.root.child;
			const parent = TreeAlpha.parent2(child);
			const key = TreeAlpha.key2(child);

			assert.equal(key, "child", "key2 should return the property key");
			assert.equal(
				TreeAlpha.child(parent, key),
				child,
				"child(parent2(node), key2(node)) should equal node",
			);
		});

		it("holds for array elements", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Item extends schemaFactory.object("Item", {
				value: schemaFactory.number,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: schemaFactory.array(Item) }));
			view.initialize([{ value: 1 }, { value: 2 }, { value: 3 }]);

			const item = view.root[1];
			const parent = TreeAlpha.parent2(item);
			const key = TreeAlpha.key2(item);

			assert.equal(key, 1, "key2 should return the array index");
			assert.equal(
				TreeAlpha.child(parent, key),
				item,
				"child(parent2(node), key2(node)) should equal node",
			);
		});

		it("holds for detached nodes", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Item extends schemaFactory.object("Item", {
				value: schemaFactory.number,
			}) {}
			class Container extends schemaFactory.object("Container", {
				items: schemaFactory.array(Item),
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 42 }] });

			const item = view.root.items[0];
			assert.notEqual(item, undefined);
			view.root.items.removeAt(0);

			const parent = TreeAlpha.parent2(item);
			const key = TreeAlpha.key2(item);

			assert.equal(key, undefined, "key2 should return undefined for detached nodes");
			assert.equal(
				TreeAlpha.child(parent, key),
				item,
				"child(parent2(node), key2(node)) should equal node",
			);
		});

		it("holds for unhydrated nodes", () => {
			const schemaFactory = new SchemaFactory(undefined);
			class Item extends schemaFactory.object("Item", {
				value: schemaFactory.number,
			}) {}

			const item = new Item({ value: 42 });

			const parent = TreeAlpha.parent2(item);
			const key = TreeAlpha.key2(item);

			assert.equal(key, undefined, "key2 should return undefined for unhydrated nodes");
			assert.equal(
				TreeAlpha.child(parent, key),
				item,
				"child(parent2(node), key2(node)) should equal node",
			);
		});
	});

	it("can cast to alpha", () => {
		const schemaFactory = new SchemaFactory(undefined);
		const view = getView(
			new TreeViewConfiguration({ schema: schemaFactory.null, enableSchemaValidation: true }),
		);
		view.initialize(null);
		assert.equal(asAlpha(view) satisfies TreeViewAlpha<typeof schemaFactory.null>, view);
	});
});

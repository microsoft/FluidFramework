/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockHandle, validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../api.js";
// Including tests for TreeAlpha here so they don't have to move if/when stabilized
/* eslint-disable import-x/no-internal-modules */
import {
	DocumentRootParent,
	RemovedRootParent,
	UnhydratedParent,
} from "../../shared-tree/parentObject.js";
import { runTransaction, Tree } from "../../shared-tree/tree.js";
import { TreeAlpha } from "../../shared-tree/treeAlpha.js";
/* eslint-enable import-x/no-internal-modules */
import {
	SchemaFactory,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
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

	// Shared schemas for parentObject API tests
	const sf = new SchemaFactory(undefined);
	class ChildNode extends sf.object("ChildNode", { value: sf.number }) {}
	class ParentNode extends sf.object("ParentNode", { child: ChildNode }) {}
	class Container extends sf.object("Container", { items: sf.array(ChildNode) }) {}

	describe("parent2", () => {
		it("returns parent TreeNode for nested nodes and DocumentRootParent for root nodes", () => {
			const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
			view.initialize({ child: { value: 1 } });

			const root = view.root;
			assert.equal(TreeAlpha.parent2(root.child), root);
			assert(TreeAlpha.parent2(root) instanceof DocumentRootParent);
		});

		it("throws when accessing parent of a disposed node", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });

			const item = view.root.items[0];
			view.root.items.removeAt(0);
			view.dispose();

			assert.throws(
				() => TreeAlpha.parent2(item),
				validateUsageError(/Cannot access a deleted node/),
			);
		});

		it("returns parent TreeNode for nested unhydrated child", () => {
			const parentNode = new ParentNode({ child: { value: 5 } });
			const child = parentNode.child;
			assert.equal(TreeAlpha.parent2(child), parentNode);
		});
	});

	describe("on", () => {
		it("fires content events on TreeNode and through DocumentRootParent", () => {
			const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
			view.initialize({ child: { value: 1 } });

			const root = view.root;
			const child = root.child;

			const rootParent = TreeAlpha.parent2(root);
			assert(rootParent instanceof DocumentRootParent);

			const log: string[] = [];
			TreeAlpha.on(child, "nodeChanged", () => log.push("child:nodeChanged"));
			TreeAlpha.on(rootParent, "nodeChanged", () => log.push("root:nodeChanged"));
			TreeAlpha.on(rootParent, "treeChanged", () => log.push("root:treeChanged"));

			// Modify the child node's value (deep change)
			child.value = 2;
			assert.deepEqual(log, ["child:nodeChanged", "root:treeChanged"]);

			// Modify the root node's child property (shallow change).
			// nodeChanged fires on root (whose property changed), not on the old child.
			log.length = 0;
			root.child = new ChildNode({ value: 3 });
			assert.deepEqual(log, ["root:nodeChanged", "root:treeChanged"]);
		});

		it("fires treeChanged on forked branch and survives rebase", () => {
			const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
			view.initialize({ child: { value: 1 } });

			const forkedView = view.fork();
			const forkDocumentRootParent = TreeAlpha.parent2(forkedView.root);

			const log: string[] = [];
			TreeAlpha.on(forkDocumentRootParent, "treeChanged", () => log.push("fork:treeChanged"));

			forkedView.root.child.value = 2;
			assert.deepEqual(log, ["fork:treeChanged"]);

			// Main branch changes should not fire on fork listener
			view.root.child.value = 3;
			assert.deepEqual(log, ["fork:treeChanged"]);

			forkedView.rebaseOnto(view);
			assert.equal(forkedView.root.child.value, 2);

			// Listener still works after rebase
			forkedView.root.child.value = 150;
			assert.deepEqual(log, ["fork:treeChanged", "fork:treeChanged"]);
		});

		it("treeChanged fires when root is replaced during rebase", () => {
			const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
			view.initialize({ child: { value: 42 } });

			const forkedView = view.fork();
			const forkDocumentRootParent = TreeAlpha.parent2(forkedView.root);

			const log: string[] = [];
			TreeAlpha.on(forkDocumentRootParent, "treeChanged", () => log.push("fork:treeChanged"));

			forkedView.root.child.value = 50;
			assert.deepEqual(log, ["fork:treeChanged"]);

			// Main branch root replacement should not fire on fork listener
			view.root = new ParentNode({ child: { value: 100 } });
			assert.deepEqual(log, ["fork:treeChanged"]);

			// Rebase fires due to root replacement, and fork gets new root
			forkedView.rebaseOnto(view);
			assert.deepEqual(log, ["fork:treeChanged", "fork:treeChanged"]);
			assert.equal(forkedView.root.child.value, 100);

			// Listener still works after root replacement
			forkedView.root.child.value = 200;
			assert.deepEqual(log, ["fork:treeChanged", "fork:treeChanged", "fork:treeChanged"]);
		});

		describe("RemovedRootParent", () => {
			it("fires status change on reattach and respects unsubscribe", () => {
				const view = getView(new TreeViewConfiguration({ schema: Container }));
				view.initialize({ items: [{ value: 42 }] });

				const undoRedoStacks = createTestUndoRedoStacks(view.events);

				const item = view.root.items[0];
				view.root.items.removeAt(0);

				const parent = TreeAlpha.parent2(item);
				assert(parent instanceof RemovedRootParent);

				const log: string[] = [];
				// Subscribe twice — unsubscribe one to verify unsubscribe works
				const unsubscribe = TreeAlpha.on(parent, "nodeChanged", () =>
					log.push("unsubscribed-listener"),
				);
				TreeAlpha.on(parent, "nodeChanged", () => log.push("nodeChanged"));
				unsubscribe();

				// Undo the removal (re-attaches the node)
				undoRedoStacks.undoStack.pop()?.revert();

				// Only the still-subscribed listener should have fired
				assert.deepEqual(log, ["nodeChanged"]);
				assert.equal(TreeAlpha.parent2(item), view.root.items);

				undoRedoStacks.unsubscribe();
			});
		});

		describe("UnhydratedParent", () => {
			it("fires status change on hydration and respects unsubscribe", () => {
				const item = new ChildNode({ value: 42 });
				const parent = TreeAlpha.parent2(item);
				assert(parent instanceof UnhydratedParent);

				const log: string[] = [];
				const unsubscribe = TreeAlpha.on(parent, "treeChanged", () =>
					log.push("unsubscribed-listener"),
				);
				TreeAlpha.on(parent, "treeChanged", () => log.push("treeChanged"));
				unsubscribe();

				const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
				view.initialize(item);

				assert.deepEqual(log, ["treeChanged"]);
			});

			it("fires status change event for nested unhydrated nodes", () => {
				const parentNode = new ParentNode({ child: { value: 5 } });

				const rootParent = TreeAlpha.parent2(parentNode);
				assert(rootParent instanceof UnhydratedParent);

				const log: string[] = [];
				TreeAlpha.on(rootParent, "treeChanged", () => log.push("treeChanged"));

				const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
				view.initialize(parentNode);

				assert.deepEqual(log, ["treeChanged"]);
			});
		});

		it("nodeChanged on DocumentRootParent does not fire on root replacement but re-subscribes to new root", () => {
			const view = getView(
				new TreeViewConfigurationAlpha({ schema: sf.optional(ParentNode) }),
			);
			view.initialize({ child: { value: 1 } });

			const root = view.root;
			assert(root !== undefined);
			const rootParent = TreeAlpha.parent2(root);
			assert(rootParent instanceof DocumentRootParent);

			const log: string[] = [];
			TreeAlpha.on(rootParent, "nodeChanged", () => log.push("nodeChanged"));

			// Replace the root entirely — nodeChanged should NOT fire
			view.root = new ParentNode({ child: { value: 2 } });
			assert.deepEqual(log, []);

			// Modify a property on the new root — nodeChanged SHOULD fire
			const newRoot = view.root;
			assert(newRoot !== undefined);
			newRoot.child = new ChildNode({ value: 3 });
			assert.deepEqual(log, ["nodeChanged"]);
		});

		it("handles on() with DocumentRootParent when optional root is set to undefined", () => {
			const view = getView(new TreeViewConfigurationAlpha({ schema: sf.optional(ChildNode) }));
			view.initialize({ value: 1 });

			const root = view.root;
			assert(root !== undefined);
			const rootParent = TreeAlpha.parent2(root);
			assert(rootParent instanceof DocumentRootParent);

			const log: string[] = [];
			TreeAlpha.on(rootParent, "treeChanged", () => log.push("treeChanged"));

			root.value = 2;
			assert.deepEqual(log, ["treeChanged"]);

			// Set root to undefined — listener should fire for treeChanged
			log.length = 0;
			view.root = undefined;
			assert.deepEqual(log, ["treeChanged"]);

			// Set root back to a node — listener should fire and re-subscribe
			log.length = 0;
			view.root = new ChildNode({ value: 3 });
			assert.deepEqual(log, ["treeChanged"]);

			// Modify the new root — listener should still work
			log.length = 0;
			const newRoot = view.root;
			assert(newRoot !== undefined);
			newRoot.value = 4;
			assert.deepEqual(log, ["treeChanged"]);
		});

		it("cleans up DocumentRootParent listener when view is disposed", () => {
			const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
			view.initialize({ value: 1 });

			const root = view.root;
			const rootParent = TreeAlpha.parent2(root);
			assert(rootParent instanceof DocumentRootParent);

			const log: string[] = [];
			const unsubscribe = TreeAlpha.on(rootParent, "treeChanged", () =>
				log.push("treeChanged"),
			);

			root.value = 2;
			assert.deepEqual(log, ["treeChanged"]);

			// Dispose the view — further mutations should not be possible
			view.dispose();

			// Listener should not fire after disposal (node is no longer accessible)
			assert.throws(() => {
				root.value = 3;
			});
			assert.deepEqual(log, ["treeChanged"]);

			// Calling unsubscribe after disposal should not throw
			assert.doesNotThrow(() => unsubscribe());
		});

		it("fires events through full lifecycle: New → InDocument → Removed → InDocument", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [] });

			const undoRedoStacks = createTestUndoRedoStacks(view.events);

			// New → InDocument: create and insert a node
			const item = new ChildNode({ value: 42 });
			const unhydratedParent = TreeAlpha.parent2(item);

			const log: string[] = [];
			TreeAlpha.on(unhydratedParent, "treeChanged", () => log.push("hydrated"));

			view.root.items.insertAtEnd(item);
			assert.deepEqual(log, ["hydrated"]);

			// InDocument → Removed: remove the node
			view.root.items.removeAt(0);

			const detachedParent = TreeAlpha.parent2(item);
			TreeAlpha.on(detachedParent, "nodeChanged", () => log.push("reattached"));

			// Removed → InDocument: undo the removal
			undoRedoStacks.undoStack.pop()?.revert();

			assert.deepEqual(log, ["hydrated", "reattached"]);

			undoRedoStacks.unsubscribe();
		});
	});

	describe("child and children", () => {
		it("returns root node via DocumentRootParent", () => {
			const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
			view.initialize({ value: 42 });

			const root = view.root;
			const rootParent = TreeAlpha.parent2(root);
			assert(rootParent instanceof DocumentRootParent);

			assert.equal(TreeAlpha.child(rootParent, undefined), root);
			assert.equal(TreeAlpha.child(rootParent, "foo"), undefined);

			const childrenResult = [...TreeAlpha.children(rootParent)];
			assert.equal(childrenResult.length, 1);
			assert.deepEqual(childrenResult[0], [undefined, root]);
		});

		it("returns removed node via RemovedRootParent", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 1 }] });

			const item = view.root.items[0];
			view.root.items.removeAt(0);

			const detachedParent = TreeAlpha.parent2(item);
			assert(detachedParent instanceof RemovedRootParent);

			assert.equal(TreeAlpha.child(detachedParent, undefined), item);

			const childrenResult = [...TreeAlpha.children(detachedParent)];
			assert.equal(childrenResult.length, 1);
			assert.deepEqual(childrenResult[0], [undefined, item]);
		});

		it("returns unhydrated node via UnhydratedParent", () => {
			const item = new ChildNode({ value: 42 });
			const unhydratedParent = TreeAlpha.parent2(item);
			assert(unhydratedParent instanceof UnhydratedParent);

			assert.equal(TreeAlpha.child(unhydratedParent, undefined), item);

			const childrenResult = [...TreeAlpha.children(unhydratedParent)];
			assert.equal(childrenResult.length, 1);
			assert.deepEqual(childrenResult[0], [undefined, item]);
		});

		it("returns empty results for DocumentRootParent with optional empty root", () => {
			const view = getView(new TreeViewConfigurationAlpha({ schema: sf.optional(ChildNode) }));
			view.initialize({ value: 42 });
			const root = view.root;
			assert(root !== undefined);
			const rootParent = TreeAlpha.parent2(root);
			assert(rootParent instanceof DocumentRootParent);

			view.root = undefined;

			assert.equal(TreeAlpha.child(rootParent, undefined), undefined);
			assert.deepEqual([...TreeAlpha.children(rootParent)], []);
		});

		it("returns undefined when calling child on a TreeNode with undefined key", () => {
			const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
			view.initialize({ child: { value: 42 } });

			const root = view.root;
			assert.equal(TreeAlpha.child(root, undefined), undefined);
		});
	});

	describe("parent2/key2/child invariant", () => {
		it("holds for root nodes", () => {
			const view = getView(new TreeViewConfiguration({ schema: ChildNode }));
			view.initialize({ value: 42 });

			const root = view.root;
			const parent = TreeAlpha.parent2(root);
			const key = TreeAlpha.key2(root);

			assert.equal(key, undefined);
			assert.equal(TreeAlpha.child(parent, key), root);
		});

		it("holds for nested nodes", () => {
			const view = getView(new TreeViewConfiguration({ schema: ParentNode }));
			view.initialize({ child: { value: 42 } });

			const child = view.root.child;
			const parent = TreeAlpha.parent2(child);
			const key = TreeAlpha.key2(child);

			assert.equal(key, "child");
			assert.equal(TreeAlpha.child(parent, key), child);
		});

		it("holds for array elements", () => {
			const view = getView(new TreeViewConfiguration({ schema: sf.array(ChildNode) }));
			view.initialize([{ value: 1 }, { value: 2 }, { value: 3 }]);

			const item = view.root[1];
			const parent = TreeAlpha.parent2(item);
			const key = TreeAlpha.key2(item);

			assert.equal(key, 1);
			assert.equal(TreeAlpha.child(parent, key), item);
		});

		it("holds for detached nodes", () => {
			const view = getView(new TreeViewConfiguration({ schema: Container }));
			view.initialize({ items: [{ value: 42 }] });

			const item = view.root.items[0];
			assert.notEqual(item, undefined);
			view.root.items.removeAt(0);

			const parent = TreeAlpha.parent2(item);
			const key = TreeAlpha.key2(item);

			assert.equal(key, undefined);
			assert.equal(TreeAlpha.child(parent, key), item);
		});

		it("holds for unhydrated nodes", () => {
			const item = new ChildNode({ value: 42 });

			const parent = TreeAlpha.parent2(item);
			const key = TreeAlpha.key2(item);

			assert.equal(key, undefined);
			assert.equal(TreeAlpha.child(parent, key), item);
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

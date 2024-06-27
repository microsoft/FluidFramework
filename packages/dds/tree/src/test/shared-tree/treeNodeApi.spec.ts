/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CheckoutFlexTreeView,
	type TransactionConstraint,
	Tree,
	type rollback,
} from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
	type TreeView,
	type InsertableTypedNode,
} from "../../simple-tree/index.js";
import { TestTreeProviderLite, createTestUndoRedoStacks, getView } from "../utils.js";

// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "../simple-tree/utils.js";
import type { requireAssignableTo } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { runTransaction } from "../../shared-tree/treeApi.js";

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

		/**
		 * Runs a set of transaction tests, either passing the TreeView or the root node to the `runTransaction` function depending on the configuration.
		 * @remarks This allows for code coverage of both of those variants of the `runTransaction` API without duplicating these tests entirely.
		 * */
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
						throw Error("Oh no");
					});
				} catch (e) {
					assert(e instanceof Error);
					assert.equal(e.message, "Oh no");
				}
				assert.equal(view.root.content, 42);
			});

			it("undoes and redoes entire transaction", () => {
				const view = getTestObjectView();
				const checkoutView = view.getView();
				assert(checkoutView instanceof CheckoutFlexTreeView);
				const { undoStack, redoStack } = createTestUndoRedoStacks(
					checkoutView.checkout.events,
				);

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
				provider.processMessages();

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
				provider.processMessages();
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
				let event = false;
				view.events.on("rootChanged", () => (event = true));
				view.root.content = 44;
				Tree.runTransaction(view, (root) => {
					root.content = 43;
				});
				assert.equal(event, true);
			});

			it.skip("emits change events on rollback", () => {
				const view = getTestObjectView();
				let eventCount = 0;
				view.events.on("rootChanged", () => (eventCount += 1));
				Tree.runTransaction(view, (r) => {
					r.content = 43;
					return Tree.runTransaction.rollback;
				});
				assert.equal(eventCount, 2);
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
});

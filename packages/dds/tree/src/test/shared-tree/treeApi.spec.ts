/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CheckoutFlexTreeView,
	TransactionConstraint,
	Tree,
	rollback,
} from "../../shared-tree/index.js";
import {
	type NodeFromSchema,
	SchemaFactory,
	type TreeChangeEvents,
	TreeConfiguration,
	ValidateRecursiveSchema,
	TreeView,
	InsertableTypedNode,
} from "../../simple-tree/index.js";
import { TestTreeProviderLite, createTestUndoRedoStacks, getView } from "../utils.js";
import { brand, cursorForJsonableTreeNode, leaf, rootFieldKey, type UpPath } from "../../index.js";
// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "../simple-tree/utils.js";
import { requireAssignableTo } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { runTransaction } from "../../shared-tree/treeApi.js";

const rootNode: UpPath = {
	parent: undefined,
	parentField: rootFieldKey,
	parentIndex: 0,
};

describe("treeApi", () => {
	describe("runTransaction", () => {
		const schemaFactory = new SchemaFactory(undefined);
		class ChildObject extends schemaFactory.object("ChildObject", {}) {}
		class TestObject extends schemaFactory.object("TestObject", {
			content: schemaFactory.number,
			child: schemaFactory.optional(ChildObject),
		}) {}

		function getTestObjectView(child?: InsertableTypedNode<typeof ChildObject>) {
			return getView(
				new TreeConfiguration(TestObject, () => ({
					content: 42,
					child,
				})),
			);
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
				const checkoutView = view.getViewOrError();
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
				const config = new TreeConfiguration(TestObject, () => ({
					content: 42,
					child: {},
				}));
				const provider = new TestTreeProviderLite(2);
				const [treeA, treeB] = provider.trees;
				const viewA = treeA.schematize(config);
				const viewB = treeB.schematize(config);
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
						type _ = requireAssignableTo<
							typeof result,
							typeof Tree.runTransaction.rollback
						>;
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
						type _ = requireAssignableTo<
							typeof result,
							typeof Tree.runTransaction.rollback
						>;
					} else {
						type _ = requireAssignableTo<typeof result, typeof otherSymbol>;
					}
				}
			});

			// TODO: Either enable when afterBatch is implemented, or delete if no longer relevant
			it.skip("emits change events", () => {
				const view = getTestObjectView();
				let event = false;
				view.events.on("afterBatch", () => (event = true));
				view.root.content = 44;
				Tree.runTransaction(view, (root) => {
					root.content = 43;
				});
				assert.equal(event, true);
			});

			it.skip("emits change events on rollback", () => {
				const view = getTestObjectView();
				let eventCount = 0;
				view.events.on("afterBatch", () => (eventCount += 1));
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
						type _ = requireAssignableTo<
							typeof result,
							typeof Tree.runTransaction.rollback
						>;
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
						type _ = requireAssignableTo<
							typeof result,
							typeof Tree.runTransaction.rollback
						>;
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
				assert.equal(deepEventCount, 4);
			});

			// TODO: When SchematizingSimpleTreeView supports forking, add test coverage to ensure that transactions work properly on forks
		});
	});

	describe("on", () => {
		describe("object node", () => {
			const sb = new SchemaFactory("object-node-in-root");
			class myObject extends sb.object("object", {
				myNumber: sb.number,
			}) {}
			const treeSchema = sb.object("root", {
				rootObject: myObject,
			});

			function check(
				eventName: keyof TreeChangeEvents,
				mutate: (root: NodeFromSchema<typeof treeSchema>) => void,
				expectedFirings: number = 1,
			) {
				it(`.on('${eventName}') subscribes and unsubscribes correctly`, () => {
					const { root } = getView(
						new TreeConfiguration(treeSchema, () => ({
							rootObject: {
								myNumber: 1,
							},
						})),
					);
					const log: any[][] = [];

					const unsubscribe = Tree.on(root, eventName, (...args: any[]) => {
						log.push(args);
					});

					mutate(root);

					assert.equal(log.length, expectedFirings, `'${eventName}' should fire.`);

					unsubscribe();
					mutate(root);

					assert.equal(log.length, expectedFirings, `'${eventName}' should NOT fire.`);
				});
			}

			check(
				"nodeChanged",
				(root) =>
					(root.rootObject = new myObject({
						myNumber: 2,
					})),
			);
			check("treeChanged", (root) => root.rootObject.myNumber++, 2);

			it(`change to direct fields triggers both 'nodeChanged' and 'treeChanged'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => ({
						rootObject: {
							myNumber: 1,
						},
					})),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", (...args: any[]) => shallowChanges++);
				Tree.on(root, "treeChanged", (...args: any[]) => deepChanges++);

				root.rootObject = new myObject({
					myNumber: 2,
				});

				assert.equal(shallowChanges, 1, `nodeChanged should fire.`);
				assert.equal(deepChanges, 2, `treeChanged should fire.`); // Fires during both the detach and attach visitor passes
			});

			it(`change to descendant fields only triggers 'treeChanged'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => ({
						rootObject: {
							myNumber: 1,
						},
					})),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", (...args: any[]) => shallowChanges++);
				Tree.on(root, "treeChanged", (...args: any[]) => deepChanges++);

				root.rootObject.myNumber++;

				assert.equal(shallowChanges, 0, `nodeChanged should NOT fire.`);
				assert.equal(deepChanges, 2, `treeChanged should fire.`); // Fires during both the detach and attach visitor passes
			});
		});

		describe("list node", () => {
			const sb = new SchemaFactory("list-node-in-root");
			class myObject extends sb.object("object", {
				myNumber: sb.number,
			}) {}
			const treeSchema = sb.array("root", myObject);

			function check(
				eventName: keyof TreeChangeEvents,
				mutate: (root: NodeFromSchema<typeof treeSchema>) => void,
				expectedFirings: number = 1,
			) {
				it(`.on('${eventName}') subscribes and unsubscribes correctly`, () => {
					const { root } = getView(
						new TreeConfiguration(treeSchema, () => [
							{
								myNumber: 1,
							},
						]),
					);
					const log: any[][] = [];

					const unsubscribe = Tree.on(root, eventName, (...args: any[]) => {
						log.push(args);
					});

					mutate(root);

					assert.equal(log.length, expectedFirings, `'${eventName}' should fire.`);

					unsubscribe();
					mutate(root);

					assert.equal(log.length, expectedFirings, `'${eventName}' should NOT fire.`);
				});
			}

			check("nodeChanged", (root) => root.insertAtEnd({ myNumber: 2 }));
			check("treeChanged", (root) => root[0].myNumber++, 2);

			it(`change to direct fields triggers both 'nodeChanged' and 'treeChanged'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => [
						{
							myNumber: 1,
						},
					]),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", (...args: any[]) => shallowChanges++);
				Tree.on(root, "treeChanged", (...args: any[]) => deepChanges++);

				root.insertAtEnd({ myNumber: 2 });

				assert.equal(shallowChanges, 1, `nodeChanged should NOT fire.`);
				assert.equal(deepChanges, 2, `treeChanged should fire.`); // Fires during both the detach and attach visitor passes
			});

			it(`change to descendant fields only triggers 'treeChanged'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => [
						{
							myNumber: 1,
						},
					]),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", (...args: any[]) => shallowChanges++);
				Tree.on(root, "treeChanged", (...args: any[]) => deepChanges++);

				root[0].myNumber++;

				assert.equal(shallowChanges, 0, `nodeChanged should NOT fire.`);
				assert.equal(deepChanges, 2, `treeChanged should fire.`); // Fires during both the detach and attach visitor passes
			});

			it(`move between array nodes triggers both 'nodeChanged' and 'treeChanged' the correct number of times on source and target nodes`, () => {
				const testSchema = sb.object("root", {
					array1: sb.array(sb.number),
					array2: sb.array(sb.number),
				});
				const { root } = getView(
					new TreeConfiguration(testSchema, () => ({
						array1: [1],
						array2: [2],
					})),
				);

				let a1ShallowChanges = 0;
				let a1DeepChanges = 0;
				let a2ShallowChanges = 0;
				let a2DeepChanges = 0;
				Tree.on(root.array1, "nodeChanged", (...args: any[]) => a1ShallowChanges++);
				Tree.on(root.array1, "treeChanged", (...args: any[]) => a1DeepChanges++);
				Tree.on(root.array2, "nodeChanged", (...args: any[]) => a2ShallowChanges++);
				Tree.on(root.array2, "treeChanged", (...args: any[]) => a2DeepChanges++);

				root.array2.moveToEnd(0, root.array1);

				assert.deepEqual(root.array1, []);
				assert.deepEqual(root.array2, [2, 1]);
				assert.equal(a1ShallowChanges, 1, `nodeChanged should fire once.`);
				assert.equal(a1DeepChanges, 2, `treeChanged should fire twice.`); // Fires during both the detach and attach visitor passes
				assert.equal(a2ShallowChanges, 1, `nodeChanged should fire once.`);
				assert.equal(a2DeepChanges, 2, `treeChanged should fire twice.`); // Fires during both the detach and attach visitor passes
			});
		});

		describe("map node", () => {
			const sb = new SchemaFactory("map-node-in-root");
			class myObject extends sb.object("object", {
				myNumber: sb.number,
			}) {}
			const treeSchema = sb.map("root", myObject);

			function check(
				eventName: keyof TreeChangeEvents,
				mutate: (root: NodeFromSchema<typeof treeSchema>) => void,
				expectedFirings: number = 1,
			) {
				it(`.on('${eventName}') subscribes and unsubscribes correctly`, () => {
					const { root } = getView(
						new TreeConfiguration(
							treeSchema,
							() =>
								new Map([
									[
										"a",
										{
											myNumber: 1,
										},
									],
								]),
						),
					);
					const log: any[][] = [];

					const unsubscribe = Tree.on(root, eventName, (...args: any[]) => {
						log.push(args);
					});

					mutate(root);

					assert.equal(log.length, expectedFirings, `'${eventName}' should fire.`);

					unsubscribe();
					mutate(root);

					assert.equal(log.length, expectedFirings, `'${eventName}' should NOT fire.`);
				});
			}

			check("nodeChanged", (root) => root.set("a", { myNumber: 2 }));
			check(
				"treeChanged",
				(root) => {
					const mapEntry = root.get("a");
					if (mapEntry === undefined) {
						throw new Error("Map entry for key 'a' not found");
					}
					mapEntry.myNumber++;
				},
				2,
			);

			it(`change to direct fields triggers both 'nodeChanged' and 'treeChanged'`, () => {
				const { root } = getView(
					new TreeConfiguration(
						treeSchema,
						() =>
							new Map([
								[
									"a",
									{
										myNumber: 1,
									},
								],
							]),
					),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", (...args: any[]) => shallowChanges++);
				Tree.on(root, "treeChanged", (...args: any[]) => deepChanges++);

				root.set("a", { myNumber: 2 });

				assert.equal(shallowChanges, 1, `nodeChanged should fire.`);
				assert.equal(deepChanges, 2, `treeChanged should fire.`); // Fires during both the detach and attach visitor passes
			});

			it(`change to descendant fields only triggers 'treeChanged'`, () => {
				const { root } = getView(
					new TreeConfiguration(
						treeSchema,
						() =>
							new Map([
								[
									"a",
									{
										myNumber: 1,
									},
								],
							]),
					),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", (...args: any[]) => shallowChanges++);
				Tree.on(root, "treeChanged", (...args: any[]) => deepChanges++);

				const mapEntry = root.get("a");
				if (mapEntry === undefined) {
					throw new Error("Map entry for key 'a' not found");
				}
				mapEntry.myNumber++;

				assert.equal(shallowChanges, 0, `nodeChanged should NOT fire.`);
				assert.equal(deepChanges, 2, `treeChanged should fire.`); // treeChanged fires during both the detach and attach visitor passes
			});
		});

		// Change events don't apply to leaf nodes since they don't have fields that change, they are themselves replaced
		// by other leaf nodes.

		it(`all kinds of changes trigger 'nodeChanged' and 'treeChanged' the correct number of times`, () => {
			// This test validates that any kind of change fires the events as expected.
			// Like noted in other tests, 'treeChanged' fires during both the detach and attach visitor passes so it
			// normally fires twice for any change. 'nodeChanged' usually fires once, except during moves between
			// sequences, where it fires when detaching the node from its source, and again while attaching it to the target.

			const sb = new SchemaFactory("object-node-in-root");
			const innerObject = sb.object("inner-object", { innerProp: sb.number });
			class map extends sb.map("map", sb.number) {}
			class list extends sb.array("list", sb.number) {}
			const outerObject = sb.object("outer-object", {
				objectProp: sb.optional(innerObject),
				mapProp: sb.optional(map),
				arrayProp: sb.optional(list),
				valueProp: sb.optional(sb.number),
			});
			const treeSchema = sb.object("root", {
				rootObject: outerObject,
			});

			const { root } = getView(
				new TreeConfiguration(treeSchema, () => ({
					rootObject: {
						objectProp: undefined,
						mapProp: undefined,
						arrayProp: undefined,
						valueProp: undefined,
					},
				})),
			);

			let shallowChanges = 0;
			let deepChanges = 0;
			// Deep changes subscription on the root
			Tree.on(root, "treeChanged", (...args: any[]) => {
				deepChanges++;
			});
			// Shallow changes subscription on the object property of the root
			Tree.on(root.rootObject, "nodeChanged", (...args: any[]) => {
				shallowChanges++;
			});

			let deepActionsSoFar = 0;
			let shallowActionsSoFar = 0;

			function actAndVerify(
				action: () => void,
				deepActionsIncrement: number,
				shallowActionsIncrement: number,
			) {
				action();
				deepActionsSoFar += deepActionsIncrement;
				shallowActionsSoFar += shallowActionsIncrement;
				assert.equal(shallowChanges, shallowActionsSoFar);
				assert.equal(deepChanges, deepActionsSoFar);
			}

			// Attach value node
			actAndVerify(() => (root.rootObject.valueProp = 1), 2, 1);
			// Replace value node
			actAndVerify(() => (root.rootObject.valueProp = 2), 2, 1);
			// Detach value node
			actAndVerify(() => (root.rootObject.valueProp = undefined), 2, 1);

			// Attach object node
			actAndVerify(
				() => (root.rootObject.objectProp = new innerObject({ innerProp: 1 })),
				2,
				1,
			);
			// Replace object node
			actAndVerify(
				() => (root.rootObject.objectProp = new innerObject({ innerProp: 2 })),
				2,
				1,
			);
			// Detach object node
			actAndVerify(() => (root.rootObject.objectProp = undefined), 2, 1);

			// Attach map node
			actAndVerify(() => (root.rootObject.mapProp = new map(new Map([["a", 1]]))), 2, 1);
			// Replace map node
			actAndVerify(() => (root.rootObject.mapProp = new map(new Map([["b", 2]]))), 2, 1);
			// Set key on map node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.mapProp?.set("c", 3), 2, 0); // The node at mapProp isn't changing so no shallow change on rootObject
			// Delete key on map node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.mapProp?.delete("c"), 2, 0); // The node at mapProp isn't changing so no shallow change on rootObject
			// Detach map node
			actAndVerify(() => (root.rootObject.mapProp = undefined), 2, 1);

			// Attach array node
			actAndVerify(() => (root.rootObject.arrayProp = new list([1])), 2, 1);
			// Replace array node
			actAndVerify(() => (root.rootObject.arrayProp = new list([2])), 2, 1);
			// Insert into array node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.arrayProp?.insertAtEnd(3), 2, 0); // The node at arrayProp isn't changing so no shallow change on rootObject
			// Move within array node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.arrayProp?.moveToEnd(0), 2, 0); // The node at arrayProp isn't changing so no shallow change on rootObject
			// Remove from array node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.arrayProp?.removeAt(0), 2, 0); // The node at arrayProp isn't changing so no shallow change on rootObject
			// Detach array node
			actAndVerify(() => (root.rootObject.arrayProp = undefined), 2, 1);
		});

		it(`batched changes to several direct fields trigger 'nodeChanged' and 'treeChanged' the correct number of times`, () => {
			const sb = new SchemaFactory("object-node-in-root");
			const treeSchema = sb.object("root", {
				prop1: sb.number,
				prop2: sb.number,
			});

			const { root, checkout } = getView(
				new TreeConfiguration(treeSchema, () => ({ prop1: 1, prop2: 1 })),
			);

			let shallowChanges = 0;
			let deepChanges = 0;
			Tree.on(root, "nodeChanged", (...args: any[]) => shallowChanges++);
			Tree.on(root, "treeChanged", (...args: any[]) => deepChanges++);

			const branch = checkout.fork();
			branch.editor
				.valueField({ parent: rootNode, field: brand("prop1") })
				.set(cursorForJsonableTreeNode({ type: leaf.number.name, value: 2 }));
			branch.editor
				.valueField({ parent: rootNode, field: brand("prop2") })
				.set(cursorForJsonableTreeNode({ type: leaf.number.name, value: 2 }));

			checkout.merge(branch);

			assert.equal(root.prop1, 2, "'prop2' value did not change as expected");
			assert.equal(root.prop2, 2, "'prop2' value did not change as expected");
			// Changes should be batched so we should only get "one" firing of each event type.
			// In practice this actually means two for treeChanged, because it fires once during each visitor pass
			// (detach then attach).
			// Node replacements only have effects during the attach pass so nodeChanged only fires once.
			assert.equal(deepChanges, 2, "'treeChanged' should fire twice");
			assert.equal(shallowChanges, 1, "'nodeChanged' should only fire once");
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { CheckoutFlexTreeView, Tree } from "../../shared-tree/index.js";
import {
	type NodeFromSchema,
	SchemaFactory,
	type TreeChangeEvents,
	TreeConfiguration,
} from "../../simple-tree/index.js";
import { createTestUndoRedoStacks, getView } from "../utils.js";

const schema = new SchemaFactory("com.example");
class TestObject extends schema.object("TestObject", { content: schema.number }) {}

describe("treeApi", () => {
	describe("runTransaction invoked via a tree view", () => {
		it("runs transactions", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(view, (root) => {
				root.content = 43;
			});
			assert.equal(view.root.content, 43);
		});

		it("can be rolled back", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(view, (root) => {
				root.content = 43;
				return "rollback";
			});
			assert.equal(view.root.content, 42);
		});

		it("rolls back transactions on error", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			try {
				Tree.runTransaction(view, (root) => {
					root.content = 43;
					throw Error("Oh no");
				});
			} catch (e) {
				assert(e instanceof Error);
				assert.equal(e.message, "Oh no");
			}
			assert.equal(view.root.content, 42);
		});

		// TODO: Either enable when afterBatch is implemented, or delete if no longer relevant
		it.skip("emits change events", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			let event = false;
			view.events.on("afterBatch", () => (event = true));
			view.root.content = 44;
			Tree.runTransaction(view, (root) => {
				root.content = 43;
			});
			assert.equal(event, true);
		});

		it.skip("emits change events on rollback", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			let eventCount = 0;
			view.events.on("afterBatch", () => (eventCount += 1));
			Tree.runTransaction(view, (r) => {
				r.content = 43;
				return "rollback";
			});
			assert.equal(eventCount, 2);
		});

		it("undoes and redoes entire transaction", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			const checkoutView = view.getViewOrError();
			assert(checkoutView instanceof CheckoutFlexTreeView);
			const { undoStack, redoStack } = createTestUndoRedoStacks(checkoutView.checkout.events);

			Tree.runTransaction(view, (root) => {
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
	});

	describe("runTransaction invoked via a node", () => {
		it("runs transactions", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
			});
			assert.equal(root.content, 43);
		});

		it("can be rolled back", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
				return "rollback";
			});
			assert.equal(root.content, 42);
		});

		it("rolls back transactions on error", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			try {
				Tree.runTransaction(root, (r) => {
					r.content = 43;
					throw Error("Oh no");
				});
			} catch (e) {
				assert(e instanceof Error);
				assert.equal(e.message, "Oh no");
			}
			assert.equal(root.content, 42);
		});

		it("emits change events", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			let deepEvent = false;
			let shallowEvent = false;
			Tree.on(root, "afterShallowChange", () => (shallowEvent = true));
			Tree.on(root, "afterDeepChange", () => (deepEvent = true));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
			});
			assert.equal(shallowEvent, true);
			assert.equal(deepEvent, true);
		});

		it("emits change events on rollback", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			let deepEventCount = 0;
			let shallowEventCount = 0;
			Tree.on(root, "afterShallowChange", () => (shallowEventCount += 1));
			Tree.on(root, "afterDeepChange", () => (deepEventCount += 1));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
				return "rollback";
			});
			// One firing of events during the initial change, another during rollback
			assert.equal(shallowEventCount, 2);
			assert.equal(deepEventCount, 2);
		});

		it("undoes and redoes entire transaction", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			const checkoutView = view.getViewOrError();
			assert(checkoutView instanceof CheckoutFlexTreeView);
			const { undoStack, redoStack } = createTestUndoRedoStacks(checkoutView.checkout.events);

			Tree.runTransaction(view.root, (r) => {
				r.content = 43;
				r.content = 44;
			});
			assert.equal(view.root.content, 44);
			assert.equal(undoStack.length, 1);
			undoStack[0].revert();
			assert.equal(view.root.content, 42);
			assert.equal(redoStack.length, 1);
			redoStack[0].revert();
			assert.equal(view.root.content, 44);
		});

		// TODO: When SchematizingSimpleTreeView supports forking, add test coverage to ensure that transactions work properly on forks
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

					assert.equal(
						log.length,
						1,
						`Must receive change notifications after subscribing to event '${eventName}'.`,
					);

					unsubscribe();

					mutate(root);

					assert.equal(
						log.length,
						1,
						`Mutation after unsubscribe must not emit event '${eventName}'.`,
					);
				});
			}

			check(
				"afterShallowChange",
				(root) =>
					(root.rootObject = new myObject({
						myNumber: 2,
					})),
			);
			check("afterDeepChange", (root) => root.rootObject.myNumber++);

			it(`change to direct fields triggers both 'afterShallowChange' and 'afterDeepChange'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => ({
						rootObject: {
							myNumber: 1,
						},
					})),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "afterShallowChange", (...args: any[]) => {
					shallowChanges++;
				});
				Tree.on(root, "afterDeepChange", (...args: any[]) => {
					deepChanges++;
				});

				root.rootObject = new myObject({
					myNumber: 2,
				});

				assert.equal(
					shallowChanges,
					1,
					`Must trigger afterShallowChange when direct fields change.`,
				);

				assert.equal(
					deepChanges,
					1,
					`Must trigger afterDeepChange when direct fields change.`,
				);
			});

			it(`change to descendant fields only triggers 'afterDeepChange'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => ({
						rootObject: {
							myNumber: 1,
						},
					})),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "afterShallowChange", (...args: any[]) => {
					shallowChanges++;
				});
				Tree.on(root, "afterDeepChange", (...args: any[]) => {
					deepChanges++;
				});

				root.rootObject.myNumber++;

				assert.equal(
					shallowChanges,
					0,
					`Must NOT trigger afterShallowChange when descendant fields change.`,
				);

				assert.equal(
					deepChanges,
					1,
					`Must trigger afterDeepChange when descendant fields change.`,
				);
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

					assert.equal(
						log.length,
						1,
						`Must receive change notifications after subscribing to event '${eventName}'.`,
					);

					unsubscribe();

					mutate(root);

					assert.equal(
						log.length,
						1,
						`Mutation after unsubscribe must not emit event '${eventName}'.`,
					);
				});
			}

			check("afterShallowChange", (root) => root.insertAtEnd({ myNumber: 2 }));
			check("afterDeepChange", (root) => root[0].myNumber++);

			it(`change to direct fields triggers both 'afterShallowChange' and 'afterDeepChange'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => [
						{
							myNumber: 1,
						},
					]),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "afterShallowChange", (...args: any[]) => {
					shallowChanges++;
				});
				Tree.on(root, "afterDeepChange", (...args: any[]) => {
					deepChanges++;
				});

				root.insertAtEnd({ myNumber: 2 });

				assert.equal(
					shallowChanges,
					1,
					`Must trigger afterShallowChange when direct fields change.`,
				);

				assert.equal(
					deepChanges,
					1,
					`Must trigger afterDeepChange when direct fields change.`,
				);
			});

			it(`change to descendant fields only triggers 'afterDeepChange'`, () => {
				const { root } = getView(
					new TreeConfiguration(treeSchema, () => [
						{
							myNumber: 1,
						},
					]),
				);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "afterShallowChange", (...args: any[]) => {
					shallowChanges++;
				});
				Tree.on(root, "afterDeepChange", (...args: any[]) => {
					deepChanges++;
				});

				root[0].myNumber++;

				assert.equal(
					shallowChanges,
					0,
					`Must NOT trigger afterShallowChange when descendant fields change.`,
				);

				assert.equal(
					deepChanges,
					1,
					`Must trigger afterDeepChange when descendant fields change.`,
				);
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

					assert.equal(
						log.length,
						1,
						`Must receive change notifications after subscribing to event '${eventName}'.`,
					);

					unsubscribe();

					mutate(root);

					assert.equal(
						log.length,
						1,
						`Mutation after unsubscribe must not emit event '${eventName}'.`,
					);
				});
			}

			check("afterShallowChange", (root) => root.set("a", { myNumber: 2 }));
			check("afterDeepChange", (root) => {
				const mapEntry = root.get("a");
				if (mapEntry === undefined) {
					throw new Error("Map entry for key 'a' not found");
				}
				mapEntry.myNumber++;
			});

			it(`change to direct fields triggers both 'afterShallowChange' and 'afterDeepChange'`, () => {
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
				Tree.on(root, "afterShallowChange", (...args: any[]) => {
					shallowChanges++;
				});
				Tree.on(root, "afterDeepChange", (...args: any[]) => {
					deepChanges++;
				});

				root.set("a", { myNumber: 2 });

				assert.equal(
					shallowChanges,
					1,
					`Must trigger afterShallowChange when direct fields change.`,
				);

				assert.equal(
					deepChanges,
					1,
					`Must trigger afterDeepChange when direct fields change.`,
				);
			});

			it(`change to descendant fields only triggers 'afterDeepChange'`, () => {
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
				Tree.on(root, "afterShallowChange", (...args: any[]) => {
					shallowChanges++;
				});
				Tree.on(root, "afterDeepChange", (...args: any[]) => {
					deepChanges++;
				});

				const mapEntry = root.get("a");
				if (mapEntry === undefined) {
					throw new Error("Map entry for key 'a' not found");
				}
				mapEntry.myNumber++;

				assert.equal(
					shallowChanges,
					0,
					`Must NOT trigger afterShallowChange when descendant fields change.`,
				);

				assert.equal(
					deepChanges,
					1,
					`Must trigger afterDeepChange when descendant fields change.`,
				);
			});
		});

		// Change events don't apply to leaf nodes since they don't have fields that change, they are themselves replaced
		// by other leaf nodes.
	});
});

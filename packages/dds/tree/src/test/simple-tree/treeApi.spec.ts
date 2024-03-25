/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { TreeChangeEvents } from "../../../dist/index.js";
import { rootFieldKey } from "../../core/index.js";
import { TreeStatus } from "../../feature-libraries/index.js";
import {
	NodeFromSchema,
	SchemaFactory,
	treeNodeApi as Tree,
	TreeConfiguration,
} from "../../simple-tree/index.js";
import { getView } from "../utils.js";
import { hydrate } from "./utils.js";

const schema = new SchemaFactory("com.example");

class Point extends schema.object("Point", {}) {}

describe("treeApi", () => {
	it("is", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const root = getView(config).root;
		assert(Tree.is(root, Point));
		assert(root instanceof Point);
		assert(!Tree.is(root, schema.number));
		assert(Tree.is(5, schema.number));
		assert(!Tree.is(root, schema.number));
		assert(!Tree.is(5, Point));

		const NotInDocument = schema.object("never", {});
		// Using a schema that is not in the document throws:
		assert.throws(() => Tree.is(root, NotInDocument));
	});

	it("`is` can narrow polymorphic leaf field content", () => {
		const config = new TreeConfiguration([schema.number, schema.string], () => "x");
		const root = getView(config).root;

		if (Tree.is(root, schema.number)) {
			const _check: number = root;
			assert.fail();
		} else {
			const value: string = root;
			assert.equal(value, "x");
		}
	});

	it("`is` can narrow polymorphic combinations of value and objects", () => {
		const config = new TreeConfiguration([Point, schema.string], () => "x");
		const root = getView(config).root;

		if (Tree.is(root, Point)) {
			const _check: Point = root;
			assert.fail();
		} else {
			const value: string = root;
			assert.equal(value, "x");
		}
	});

	it("schema", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const root = getView(config).root;
		assert.equal(Tree.schema(root), Point);
		assert.equal(Tree.schema(5), schema.number);
	});
	it("key", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const root = getView(config).root;
		assert.equal(Tree.key(root), rootFieldKey);
		assert.equal(Tree.key(root[0]), 0);
		assert.equal(Tree.key(root[1]), 1);
		assert.equal(Tree.key(root[1].x), "x");
	});

	it("parent", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const root = getView(config).root;
		assert.equal(Tree.parent(root), undefined);
		assert.equal(Tree.parent(root[0]), root);
		assert.equal(Tree.parent(root[1]), root);
		assert.equal(Tree.parent(root[1].x), root[1]);
	});

	it("treeStatus", () => {
		class Root extends schema.object("Root", { x: Point }) {}
		const config = new TreeConfiguration(Root, () => ({ x: {} }));
		const root = getView(config).root;
		const child = root.x;
		const newChild = new Point({});
		assert.equal(Tree.status(root), TreeStatus.InDocument);
		assert.equal(Tree.status(child), TreeStatus.InDocument);
		// TODO: This API layer should have an Unhydrated status:
		// assert.equal(nodeApi.status(newChild), TreeStatus.Unhydrated);
		root.x = newChild;
		assert.equal(Tree.status(root), TreeStatus.InDocument);
		assert.equal(Tree.status(child), TreeStatus.Removed);
		assert.equal(Tree.status(newChild), TreeStatus.InDocument);
		// TODO: test Deleted status.
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
					const root = hydrate(treeSchema, {
						rootObject: {
							myNumber: 1,
						},
					});
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
					root.rootObject = new myObject({
						myNumber: 2,
					}),
			);
			check("afterDeepChange", (root) => root.rootObject.myNumber++);

			it(`change to direct fields triggers both 'afterShallowChange' and 'afterDeepChange'`, () => {
				const root = hydrate(treeSchema, {
					rootObject: {
						myNumber: 1,
					},
				});

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
				})

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
				const root = hydrate(treeSchema, {
					rootObject: {
						myNumber: 1,
					},
				});

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "afterShallowChange", (...args: any[]) => {
					shallowChanges++;
				});
				Tree.on(root, "afterDeepChange", (...args: any[]) => {
					deepChanges++;
				});

				root.rootObject.myNumber++

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
					const root = hydrate(treeSchema, [
						{
							myNumber: 1,
						},
					]);
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
				const root = hydrate(treeSchema, [
					{
						myNumber: 1,
					},
				]);

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
				const root = hydrate(treeSchema, [
					{
						myNumber: 1,
					},
				]);

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
					const root = hydrate(
						treeSchema,
						new Map([
							[
								"a",
								{
									myNumber: 1,
								},
							],
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

			check("afterShallowChange", (root) => root.set("a", { myNumber: 2 }));
			check("afterDeepChange", (root) => {
				const mapEntry = root.get("a");
				if (mapEntry === undefined) {
					throw new Error("Map entry for key 'a' not found");
				}
				mapEntry.myNumber++;
			});

			it(`change to direct fields triggers both 'afterShallowChange' and 'afterDeepChange'`, () => {
				const root = hydrate(
					treeSchema,
					new Map([
						[
							"a",
							{
								myNumber: 1,
							},
						],
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

				root.set("a", { myNumber: 2 })

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
				const root = hydrate(
					treeSchema,
					new Map([
						[
							"a",
							{
								myNumber: 1,
							},
						],
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

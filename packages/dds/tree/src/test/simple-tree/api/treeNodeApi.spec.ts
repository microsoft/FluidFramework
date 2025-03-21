/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	MockHandle,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import { type NormalizedUpPath, rootFieldKey } from "../../../core/index.js";
import {
	MockNodeIdentifierManager,
	TreeStatus,
	type StableNodeIdentifier,
} from "../../../feature-libraries/index.js";
import {
	isTreeNode,
	type NodeFromSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
	treeNodeApi as Tree,
	TreeBeta,
	type TreeChangeEvents,
	type TreeLeafValue,
	type TreeNode,
	TreeViewConfiguration,
	type UnsafeUnknownSchema,
} from "../../../simple-tree/index.js";
import { chunkFromJsonableTrees, getView, validateUsageError } from "../../utils.js";
import { getViewForForkedBranch, hydrate } from "../utils.js";
import { brand, type areSafelyAssignable, type requireTrue } from "../../../util/index.js";

import {
	booleanSchema,
	handleSchema,
	nullSchema,
	numberSchema,
	stringSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/leafNodeSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { tryGetSchema } from "../../../simple-tree/api/treeNodeApi.js";
import { testSimpleTrees } from "../../testTrees.js";
import { FluidClientVersion } from "../../../codec/index.js";
import { ajvValidator } from "../../codec/index.js";
import { TreeAlpha } from "../../../shared-tree/index.js";

const schema = new SchemaFactory("com.example");

class Point extends schema.object("Point", {}) {}

describe("treeNodeApi", () => {
	describe("is", () => {
		it("is", () => {
			const config = new TreeViewConfiguration({ schema: [Point, schema.number] });
			const view = getView(config);
			view.initialize({});
			const { root } = view;
			assert(Tree.is(root, Point));
			assert(root instanceof Point);
			assert(!Tree.is(root, schema.number));
			assert(Tree.is(5, schema.number));
			assert(!Tree.is(root, schema.number));
			assert(!Tree.is(5, Point));

			const NotInDocument = schema.object("never", {});
			// Using a schema that is not in the document works:
			assert(!Tree.is(root, NotInDocument));
		});

		it("`is` can narrow polymorphic leaf field content", () => {
			const config = new TreeViewConfiguration({ schema: [schema.number, schema.string] });
			const view = getView(config);
			view.initialize("x");
			const { root } = view;
			if (Tree.is(root, schema.number)) {
				const _check: number = root;
				assert.fail();
			} else {
				const value: string = root;
				assert.equal(value, "x");
			}
		});

		it("`is` can narrow polymorphic combinations of value and objects", () => {
			const config = new TreeViewConfiguration({ schema: [Point, schema.string] });
			const view = getView(config);
			view.initialize("x");
			const { root } = view;
			if (Tree.is(root, Point)) {
				const _check: Point = root;
				assert.fail();
			} else {
				const value: string = root;
				assert.equal(value, "x");
			}
		});

		it("`is` can handle leaves", () => {
			// true case for primitive
			assert(Tree.is(5, schema.number));
			// non-leaf primitives
			assert(!Tree.is(BigInt(5), schema.number));
			assert(!Tree.is(Symbol(), schema.number));
			// non-node objects
			assert(!Tree.is({}, schema.number));
			assert(!Tree.is(Tree, schema.null));
			// node to leaf
			assert(!Tree.is(hydrate(Point, {}), schema.number));
			// null: its a special case since its sorta an object
			assert(!Tree.is(null, schema.number));
			assert(Tree.is(null, schema.null));
			// handle: its a special case since it is an object but not a node
			assert(!Tree.is(null, schema.handle));
			assert(Tree.is(new MockHandle(1), schema.handle));
		});

		it("supports allowed types", () => {
			assert(!Tree.is(5, []));
			assert(!Tree.is(5, [schema.string]));
			assert(Tree.is(5, [schema.string, schema.number]));
		});

		it("errors on base type", () => {
			const Base = schema.object("Test", {});
			class Derived extends Base {}
			const node = new Derived({});
			// Check instancof alternative works:
			assert(node instanceof Base);
			assert.throws(
				() => Tree.is(node, Base),
				validateUsageError(
					/Two schema classes were used \(CustomObjectNode and Derived\) which derived from the same SchemaFactory generated class \("com.example.Test"\)/,
				),
			);
		});
	});

	describe("schema", () => {
		it("primitives", () => {
			assert.equal(Tree.schema(5), numberSchema);
			assert.equal(Tree.schema(""), stringSchema);
			assert.equal(Tree.schema(true), booleanSchema);
			assert.equal(Tree.schema(new MockHandle(5)), handleSchema);
			assert.equal(Tree.schema(null), nullSchema);
			assert.equal(tryGetSchema({}), undefined);
		});

		it("unhydrated node", () => {
			assert.equal(Tree.schema(new Point({})), Point);
			const nodePojo = schema.object("Node", {});
			assert.equal(Tree.schema(new nodePojo({})), nodePojo);
		});

		it("hydrated node", () => {
			assert.equal(Tree.schema(hydrate(Point, {})), Point);
		});
	});

	it("key", () => {
		class Child extends schema.object("Child", {
			x: Point,
			y: schema.optional(Point, { key: "stable-y" }),
		}) {}
		const Root = schema.array(Child);
		const config = new TreeViewConfiguration({ schema: Root });
		const view = getView(config);
		view.initialize([
			{ x: {}, y: undefined },
			{ x: {}, y: {} },
		]);
		const { root } = view;
		assert.equal(Tree.key(root), rootFieldKey);
		assert.equal(Tree.key(root[0]), 0);
		assert.equal(Tree.key(root[0].x), "x");
		assert.equal(Tree.key(root[1]), 1);
		assert.equal(Tree.key(root[1].x), "x");
		assert(root[1].y !== undefined);
		assert.equal(Tree.key(root[1].y), "y");
	});

	it("parent", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeViewConfiguration({ schema: Root });
		const view = getView(config);
		view.initialize([{ x: {} }, { x: {} }]);
		const { root } = view;
		assert.equal(Tree.parent(root), undefined);
		assert.equal(Tree.parent(root[0]), root);
		assert.equal(Tree.parent(root[1]), root);
		assert.equal(Tree.parent(root[1].x), root[1]);
	});

	it("treeStatus", () => {
		class Root extends schema.object("Root", { x: Point }) {}
		const config = new TreeViewConfiguration({ schema: Root });
		const view = getView(config);
		view.initialize({ x: {} });
		const { root } = view;
		const child = root.x;
		const newChild = new Point({});
		assert.equal(Tree.status(root), TreeStatus.InDocument);
		assert.equal(Tree.status(child), TreeStatus.InDocument);
		assert.equal(Tree.status(newChild), TreeStatus.New);
		root.x = newChild;
		assert.equal(Tree.status(root), TreeStatus.InDocument);
		assert.equal(Tree.status(child), TreeStatus.Removed);
		assert.equal(Tree.status(newChild), TreeStatus.InDocument);
		// TODO: test Deleted status.
	});

	describe("shortID", () => {
		it("returns local id when an identifier fieldkind exists.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				identifier: schema.identifier,
			});
			const nodeKeyManager = new MockNodeIdentifierManager();
			const id = nodeKeyManager.stabilizeNodeIdentifier(
				nodeKeyManager.generateLocalNodeIdentifier(),
			);
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config, nodeKeyManager);
			view.initialize({ identifier: id });

			assert.equal(Tree.shortId(view.root), nodeKeyManager.localizeNodeIdentifier(id));
		});
		it("returns undefined when an identifier fieldkind does not exist.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				identifier: schema.string,
			});
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config);
			view.initialize({ identifier: "testID" });

			assert.equal(Tree.shortId(view.root), undefined);
		});
		it("returns the uncompressed identifier value when the provided identifier is an invalid stable id.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				identifier: schema.identifier,
			});
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config);
			view.initialize({ identifier: "invalidUUID" });

			assert.equal(Tree.shortId(view.root), "invalidUUID");
		});
		it("returns the uncompressed identifier value when the provided identifier is a valid stable id, but unknown by the idCompressor.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				identifier: schema.identifier,
			});
			// Create a valid stableNodeKey which is not known by the tree's idCompressor.
			const nodeKeyManager = new MockNodeIdentifierManager();
			const stableNodeKey = nodeKeyManager.stabilizeNodeIdentifier(
				nodeKeyManager.generateLocalNodeIdentifier(),
			);

			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config);
			view.initialize({ identifier: stableNodeKey });

			assert.equal(Tree.shortId(view.root), stableNodeKey);
		});
		it("errors if multiple identifiers exist on the same node", () => {
			const config = new TreeViewConfiguration({
				schema: schema.object("parent", {
					identifier: schema.identifier,
					identifier2: schema.identifier,
				}),
			});

			const view = getView(config);
			view.initialize({
				identifier: "a",
				identifier2: "b",
			});
			assert.throws(
				() => Tree.shortId(view.root),
				(error: Error) =>
					validateAssertionError(
						error,
						/may not be called on a node with more than one identifier/,
					),
			);
		});

		it("Returns undefined for non-object nodes", () => {
			const config = new TreeViewConfiguration({
				schema: schema.array("parent", schema.number),
			});
			const view = getView(config);
			view.initialize([1, 2, 3]);
			assert.equal(Tree.shortId(view.root), undefined);
		});

		describe("unhydrated", () => {
			class HasIdentifier extends schema.object("HasIdentifier", {
				identifier: schema.identifier,
			}) {}
			it("returns uncompressed string for unhydrated nodes", () => {
				const node = new HasIdentifier({ identifier: "x" });
				assert.equal(Tree.shortId(node), "x");
			});
			it("errors accessing defaulted", () => {
				const node = new HasIdentifier({});
				assert.throws(
					() => {
						Tree.shortId(node);
					},
					validateUsageError(/default/),
				);
			});

			// TODO: this policy seems questionable, but its whats implemented, and is documented in TreeStatus.new
			it("returns string when unhydrated then local id when hydrated", () => {
				const nodeKeyManager = new MockNodeIdentifierManager();
				const config = new TreeViewConfiguration({ schema: HasIdentifier });
				const view = getView(config, nodeKeyManager);
				view.initialize({});
				const identifier = view.root.identifier;
				const shortId = Tree.shortId(view.root);
				assert.equal(
					shortId,
					nodeKeyManager.localizeNodeIdentifier(identifier as StableNodeIdentifier),
				);

				const node = new HasIdentifier({ identifier });
				assert.equal(Tree.shortId(node), identifier);
				view.root = node;
				assert.equal(Tree.shortId(node), shortId);
			});
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
					const root = hydrate(treeSchema, {
						rootObject: {
							myNumber: 1,
						},
					});
					const log: unknown[][] = [];

					const unsubscribe = Tree.on(root, eventName, (...args: unknown[]) => {
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
			check("treeChanged", (root) => root.rootObject.myNumber++, 1);

			it(`change to direct fields triggers both 'nodeChanged' and 'treeChanged'`, () => {
				const root = hydrate(treeSchema, {
					rootObject: {
						myNumber: 1,
					},
				});

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", () => shallowChanges++);
				Tree.on(root, "treeChanged", () => deepChanges++);

				root.rootObject = new myObject({
					myNumber: 2,
				});

				assert.equal(shallowChanges, 1, `nodeChanged should fire.`);
				assert.equal(deepChanges, 1, `treeChanged should fire.`);
			});

			it(`change to descendant fields only triggers 'treeChanged'`, () => {
				const root = hydrate(treeSchema, {
					rootObject: {
						myNumber: 1,
					},
				});

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", () => shallowChanges++);
				Tree.on(root, "treeChanged", () => deepChanges++);

				root.rootObject.myNumber++;

				assert.equal(shallowChanges, 0, `nodeChanged should NOT fire.`);
				assert.equal(deepChanges, 1, `treeChanged should fire.`);
			});
		});

		describe("array node", () => {
			const sb = new SchemaFactory("array-node-tests");
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
					const root = hydrate(treeSchema, [
						{
							myNumber: 1,
						},
					]);
					const log: unknown[][] = [];

					const unsubscribe = Tree.on(root, eventName, (...args: unknown[]) => {
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
			check("treeChanged", (root) => root[0].myNumber++, 1);

			it(`change to descendant fields only triggers 'treeChanged'`, () => {
				const root = hydrate(treeSchema, [
					{
						myNumber: 1,
					},
				]);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "nodeChanged", () => shallowChanges++);
				Tree.on(root, "treeChanged", () => deepChanges++);

				root[0].myNumber++;

				assert.equal(shallowChanges, 0, `nodeChanged should NOT fire.`);
				assert.equal(deepChanges, 1, `treeChanged should fire.`);
			});

			it(`move between array nodes triggers both 'nodeChanged' and 'treeChanged' the correct number of times on source and target nodes`, () => {
				const testSchema = sb.object("root", {
					array1: sb.array(sb.number),
					array2: sb.array(sb.number),
				});
				const root = hydrate(testSchema, {
					array1: [1],
					array2: [2],
				});

				let a1ShallowChanges = 0;
				let a1DeepChanges = 0;
				let a2ShallowChanges = 0;
				let a2DeepChanges = 0;
				Tree.on(root.array1, "nodeChanged", () => a1ShallowChanges++);
				Tree.on(root.array1, "treeChanged", () => a1DeepChanges++);
				Tree.on(root.array2, "nodeChanged", () => a2ShallowChanges++);
				Tree.on(root.array2, "treeChanged", () => a2DeepChanges++);

				root.array2.moveToEnd(0, root.array1);

				assert.deepEqual(root.array1, []);
				assert.deepEqual(root.array2, [2, 1]);
				assert.equal(a1ShallowChanges, 1, `nodeChanged should fire once.`);
				assert.equal(a1DeepChanges, 1, `treeChanged should fire once.`);
				assert.equal(a2ShallowChanges, 1, `nodeChanged should fire once.`);
				assert.equal(a2DeepChanges, 1, `treeChanged should fire once.`);
			});

			it(`all operations on the node trigger 'nodeChanged' and 'treeChanged' the correct number of times`, () => {
				const testSchema = sb.array("listRoot", sb.number);
				const root = hydrate(testSchema, []);

				let shallowChanges = 0;
				let deepChanges = 0;
				Tree.on(root, "treeChanged", () => {
					deepChanges++;
				});
				Tree.on(root, "nodeChanged", () => {
					shallowChanges++;
				});

				// Insert single item
				root.insertAtStart(1);
				assert.equal(shallowChanges, 1);
				assert.equal(deepChanges, 1);

				// Insert multiple items
				root.insertAtEnd(2, 3);
				assert.equal(shallowChanges, 2);
				assert.equal(deepChanges, 2);

				// Move one item within the same node
				root.moveToEnd(0);
				assert.equal(shallowChanges, 3);
				assert.equal(deepChanges, 3);

				// Move multiple items within the same node
				root.moveRangeToEnd(0, 2);
				assert.equal(shallowChanges, 4);
				assert.equal(deepChanges, 4);

				// Remove single item
				root.removeAt(0);
				assert.equal(shallowChanges, 5);
				assert.equal(deepChanges, 5);

				// Remove multiple items
				root.removeRange(0, 2);
				assert.equal(shallowChanges, 6);
				assert.equal(deepChanges, 6);
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
					const log: unknown[][] = [];

					const unsubscribe = Tree.on(root, eventName, (...args: unknown[]) => {
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
				1,
			);

			it(`change to direct fields triggers both 'nodeChanged' and 'treeChanged'`, () => {
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
				Tree.on(root, "nodeChanged", () => shallowChanges++);
				Tree.on(root, "treeChanged", () => deepChanges++);

				root.set("a", { myNumber: 2 });

				assert.equal(shallowChanges, 1, `nodeChanged should fire.`);
				assert.equal(deepChanges, 1, `treeChanged should fire.`);
			});

			it(`change to descendant fields only triggers 'treeChanged'`, () => {
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
				Tree.on(root, "nodeChanged", () => shallowChanges++);
				Tree.on(root, "treeChanged", () => deepChanges++);

				const mapEntry = root.get("a");
				if (mapEntry === undefined) {
					throw new Error("Map entry for key 'a' not found");
				}
				mapEntry.myNumber++;

				assert.equal(shallowChanges, 0, `nodeChanged should NOT fire.`);
				assert.equal(deepChanges, 1, `treeChanged should fire.`);
			});
		});

		// Change events don't apply to leaf nodes since they don't have fields that change, they are themselves replaced
		// by other leaf nodes.

		it(`all kinds of changes trigger 'nodeChanged' and 'treeChanged' the correct number of times`, () => {
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

			const root = hydrate(treeSchema, {
				rootObject: {
					objectProp: undefined,
					mapProp: undefined,
					arrayProp: undefined,
					valueProp: undefined,
				},
			});

			let shallowChanges = 0;
			let deepChanges = 0;
			// Deep changes subscription on the root
			Tree.on(root, "treeChanged", () => {
				deepChanges++;
			});
			// Shallow changes subscription on the object property of the root
			Tree.on(root.rootObject, "nodeChanged", () => {
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
			actAndVerify(() => (root.rootObject.valueProp = 1), 1, 1);
			// Replace value node
			actAndVerify(() => (root.rootObject.valueProp = 2), 1, 1);
			// Detach value node
			actAndVerify(() => (root.rootObject.valueProp = undefined), 1, 1);

			// Attach object node
			actAndVerify(
				() => (root.rootObject.objectProp = new innerObject({ innerProp: 1 })),
				1,
				1,
			);
			// Replace object node
			actAndVerify(
				() => (root.rootObject.objectProp = new innerObject({ innerProp: 2 })),
				1,
				1,
			);
			// Detach object node
			actAndVerify(() => (root.rootObject.objectProp = undefined), 1, 1);

			// Attach map node
			actAndVerify(() => (root.rootObject.mapProp = new map(new Map([["a", 1]]))), 1, 1);
			// Replace map node
			actAndVerify(() => (root.rootObject.mapProp = new map(new Map([["b", 2]]))), 1, 1);
			// Set key on map node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.mapProp?.set("c", 3), 1, 0); // The node at mapProp isn't changing so no shallow change on rootObject
			// Delete key on map node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.mapProp?.delete("c"), 1, 0); // The node at mapProp isn't changing so no shallow change on rootObject
			// Detach map node
			actAndVerify(() => (root.rootObject.mapProp = undefined), 1, 1);

			// Attach array node
			actAndVerify(() => (root.rootObject.arrayProp = new list([1])), 1, 1);
			// Replace array node
			actAndVerify(() => (root.rootObject.arrayProp = new list([2])), 1, 1);
			// Insert into array node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.arrayProp?.insertAtEnd(3), 1, 0); // The node at arrayProp isn't changing so no shallow change on rootObject
			// Move within array node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.arrayProp?.moveToEnd(0), 1, 0); // The node at arrayProp isn't changing so no shallow change on rootObject
			// Remove from array node (we set it above, we know it's good even if it's optional)
			actAndVerify(() => root.rootObject.arrayProp?.removeAt(0), 1, 0); // The node at arrayProp isn't changing so no shallow change on rootObject
			// Detach array node
			actAndVerify(() => (root.rootObject.arrayProp = undefined), 1, 1);
		});

		it(`batched changes to several direct fields trigger 'nodeChanged' and 'treeChanged' the correct number of times`, () => {
			const rootNode: NormalizedUpPath = {
				detachedNodeId: undefined,
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};

			const sb = new SchemaFactory("object-node-in-root");
			const treeSchema = sb.object("root", {
				prop1: sb.number,
				prop2: sb.number,
			});

			const view = getView(new TreeViewConfiguration({ schema: treeSchema }));
			view.initialize({ prop1: 1, prop2: 1 });
			const { root, checkout } = view;

			let shallowChanges = 0;
			let deepChanges = 0;
			Tree.on(root, "nodeChanged", () => shallowChanges++);
			Tree.on(root, "treeChanged", () => deepChanges++);

			const branch = checkout.branch();
			branch.editor
				.valueField({ parent: rootNode, field: brand("prop1") })
				.set(chunkFromJsonableTrees([{ type: brand(numberSchema.identifier), value: 2 }]));
			branch.editor
				.valueField({ parent: rootNode, field: brand("prop2") })
				.set(chunkFromJsonableTrees([{ type: brand(numberSchema.identifier), value: 2 }]));

			checkout.merge(branch);

			assert.equal(root.prop1, 2, "'prop2' value did not change as expected");
			assert.equal(root.prop2, 2, "'prop2' value did not change as expected");
			// Changes should be batched so we should only get one firing of each event type.
			assert.equal(deepChanges, 1, "'treeChanged' should only fire once");
			assert.equal(shallowChanges, 1, "'nodeChanged' should only fire once");
		});

		it(`'nodeChanged' and 'treeChanged' fire in the correct order`, () => {
			// The main reason this test exists is to ensure that the fact that a node (and its ancestors) might be visited
			// during the detach pass of the delta visit even if they're not being mutated during that pass, doesn't cause
			// the 'treeChanged' event to fire before the 'nodeChanged' event, which could be an easily introduced bug when
			// updating the delta visit code for the anchorset.
			const sb = new SchemaFactory("test");
			class innerObject extends sb.object("inner", { value: sb.number }) {}
			class treeSchema extends sb.object("root", {
				prop1: innerObject,
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: treeSchema }));
			view.initialize({ prop1: { value: 1 } });

			let nodeChanged = false;
			let treeChanged = false;
			// Asserts in the event handlers validate the order of the events we expect
			Tree.on(view.root.prop1, "nodeChanged", () => {
				assert(nodeChanged === false, "nodeChanged should not have fired yet");
				assert(treeChanged === false, "treeChanged should not have fired yet");
				nodeChanged = true;
			});
			Tree.on(view.root.prop1, "treeChanged", () => {
				assert(nodeChanged === true, "nodeChanged should have fired before treeChanged");
				assert(treeChanged === false, "treeChanged should not have fired yet");
				treeChanged = true;
			});

			view.root.prop1.value = 2;

			// Validate changes actually took place and all listeners fired
			assert.equal(view.root.prop1.value, 2, "'prop1' value did not change as expected");
			assert.equal(nodeChanged, true, "'nodeChanged' should have fired");
			assert.equal(treeChanged, true, "'treeChanged' should have fired");
		});

		it(`'nodeChanged' includes the names of changed properties (objectNode)`, () => {
			const sb = new SchemaFactory("test");
			class TestNode extends sb.object("root", {
				prop1: sb.optional(sb.number),
				prop2: sb.optional(sb.number),
				prop3: sb.optional(sb.number),
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: TestNode }));
			view.initialize({ prop1: 1, prop2: 2 });
			const root = view.root;

			// Using property names here instead of string checks that strong typing works.
			const eventLog: ReadonlySet<"prop1" | "prop2" | "prop3">[] = [];
			TreeBeta.on(root, "nodeChanged", ({ changedProperties }) => {
				eventLog.push(changedProperties);
			});

			const { forkView, forkCheckout } = getViewForForkedBranch(view);

			// The implementation details of the kinds of changes that can happen inside the tree are not exposed at this layer.
			// But since we know them, try to cover all of them.
			forkView.root.prop1 = 2; // Replace
			forkView.root.prop2 = undefined; // Detach
			forkView.root.prop3 = 3; // Attach

			view.checkout.merge(forkCheckout);

			assert.deepEqual(eventLog, [new Set(["prop1", "prop2", "prop3"])]);
		});

		it(`'nodeChanged' strong typing`, () => {
			// Check compile time type checking of property names

			const sb = new SchemaFactory("test");
			class ObjectAB extends sb.object("AB", {
				A: sb.optional(sb.number),
				B: sb.optional(sb.number),
			}) {}

			class ObjectBC extends sb.object("BC", {
				B: sb.optional(sb.number),
				C: sb.optional(sb.number),
			}) {}

			class Map1 extends sb.map("Map1", sb.number) {}

			class Array1 extends sb.array("Array1", sb.number) {}

			const ab = new ObjectAB({});
			const bc = new ObjectBC({});
			const map1 = new Map1({});
			const array = new Array1([]);

			TreeBeta.on(ab, "nodeChanged", (data) => {
				const x = data.changedProperties;
				type _check = requireTrue<areSafelyAssignable<typeof x, ReadonlySet<"A" | "B">>>;
			});

			// @ts-expect-error Incorrect variance (using method syntax for "nodeChanged" makes this build when it shouldn't: this is a regression test for that issue)
			TreeBeta.on(ab, "nodeChanged", (data: { changedProperties: ReadonlySet<"A"> }) => {
				const x = data.changedProperties;
			});

			function oneOf<T extends readonly unknown[]>(...items: T): T[number] {
				return items[0];
			}

			function out<T>(data: { changedProperties: ReadonlySet<T> }) {
				return data.changedProperties;
			}

			function outOpt<T>(data: { changedProperties?: ReadonlySet<T> }) {
				return data.changedProperties;
			}

			// Strong types work
			TreeBeta.on(ab, "nodeChanged", out<"A" | "B">);
			TreeBeta.on(ab, "nodeChanged", out<string>);
			// Weakly typed (general) callback works
			TreeBeta.on(ab, "nodeChanged", outOpt<string>);
			TreeBeta.on(ab as TreeNode, "nodeChanged", outOpt<string>);

			// @ts-expect-error Check these test utils work
			TreeBeta.on(ab, "nodeChanged", out<"A">);
			// @ts-expect-error Check these test utils work
			TreeBeta.on(ab, "nodeChanged", out<"A", "B", "C">);
			// @ts-expect-error Check these test utils work
			TreeBeta.on(ab as TreeNode, "nodeChanged", out<"A">);

			// Union cases

			TreeBeta.on(oneOf(ab, bc), "nodeChanged", out<"A" | "B" | "C">);
			TreeBeta.on(oneOf(ab, map1), "nodeChanged", out<string>);
			// @ts-expect-error Check map is included
			TreeBeta.on(oneOf(ab, map1), "nodeChanged", out<"A" | "B">);

			// @ts-expect-error Array makes changedProperties optional
			TreeBeta.on(array, "nodeChanged", out<string>);
			TreeBeta.on(array, "nodeChanged", outOpt<string>);
		});

		it(`'nodeChanged' strong typing example`, () => {
			const factory = new SchemaFactory("example");
			class Point2d extends factory.object("Point2d", {
				x: factory.number,
				y: factory.number,
			}) {}

			const point = new Point2d({ x: 0, y: 0 });

			TreeBeta.on(point, "nodeChanged", (data) => {
				const changed: ReadonlySet<"x" | "y"> = data.changedProperties;
				if (changed.has("x")) {
					// ...
				}
			});

			TreeBeta.on(point, "nodeChanged", (data) => {
				// @ts-expect-error Strong typing for changed properties of object nodes detects incorrect keys:
				if (data.changedProperties.has("z")) {
					// ...
				}
			});
		});

		it(`'nodeChanged' includes the names of changed properties (mapNode)`, () => {
			const sb = new SchemaFactory("test");
			class TestNode extends sb.map("root", [sb.number]) {}

			const view = getView(new TreeViewConfiguration({ schema: TestNode }));
			view.initialize(
				new Map([
					["key1", 1],
					["key2", 2],
				]),
			);
			const root = view.root;

			const eventLog: ReadonlySet<string>[] = [];
			TreeBeta.on(root, "nodeChanged", ({ changedProperties }) =>
				eventLog.push(changedProperties),
			);

			const { forkView, forkCheckout } = getViewForForkedBranch(view);

			// The implementation details of the kinds of changes that can happen inside the tree are not exposed at this layer.
			// But since we know them, try to cover all of them.
			forkView.root.set("key1", 0); // Replace existing key
			forkView.root.delete("key2"); // Remove a key
			forkView.root.set("key3", 3); // Add new key

			view.checkout.merge(forkCheckout);

			assert.deepEqual(eventLog, [new Set(["key1", "key2", "key3"])]);
		});

		it(`'nodeChanged' does not include the names of changed properties (arrayNode)`, () => {
			const sb = new SchemaFactory("test");
			class TestNode extends sb.array("root", [sb.number]) {}

			const view = getView(new TreeViewConfiguration({ schema: TestNode }));
			view.initialize([1, 2]);
			const root = view.root;

			const eventLog: (ReadonlySet<string> | undefined)[] = [];
			TreeBeta.on(root, "nodeChanged", (data) => eventLog.push(data.changedProperties));

			const { forkView, forkCheckout } = getViewForForkedBranch(view);

			// The implementation details of the kinds of changes that can happen inside the tree are not exposed at this layer.
			// But since we know them, try to cover all of them.
			forkView.root.insertAtEnd(3); // Append to array
			forkView.root.removeAt(0); // Remove from array
			forkView.root.moveRangeToEnd(0, 1); // Move within array

			view.checkout.merge(forkCheckout);

			assert.deepEqual(eventLog, [undefined]);
		});

		it(`'nodeChanged' uses property keys, not stored keys, for the list of changed properties`, () => {
			const sb = new SchemaFactory("test");
			class TestNode extends sb.object("root", {
				prop1: sb.optional(sb.number, { key: "stored-prop1" }),
			}) {}

			const view = getView(new TreeViewConfiguration({ schema: TestNode }));
			view.initialize({ prop1: 1 });
			const root = view.root;

			const eventLog: ReadonlySet<string>[] = [];
			TreeBeta.on(root, "nodeChanged", ({ changedProperties }) =>
				eventLog.push(changedProperties),
			);

			const { forkView, forkCheckout } = getViewForForkedBranch(view);

			forkView.root.prop1 = 2;

			view.checkout.merge(forkCheckout);

			assert.deepEqual(eventLog, [new Set(["prop1"])]);
		});
	});

	describe("tree.clone", () => {
		class TestPoint extends schema.object("TestPoint", {
			x: schema.number,
			y: schema.number,
			metadata: schema.optional(schema.string),
		}) {}

		class TestRectangle extends schema.object("TestRectangle", {
			topLeft: TestPoint,
			bottomRight: TestPoint,
			innerPoints: schema.array(TestPoint),
		}) {}

		it("clones unhydrated nodes", () => {
			const topLeft = new TestPoint({ x: 1, y: 1 });
			const bottomRight = new TestPoint({ x: 10, y: 10 });
			const rectangle = new TestRectangle({ topLeft, bottomRight, innerPoints: [] });

			// Clone the root rectangle node.
			const clonedRectangle = TreeBeta.clone<typeof TestRectangle>(rectangle);
			assert.deepEqual(rectangle, clonedRectangle, "Root node not cloned properly");
			assert.notEqual(
				rectangle,
				clonedRectangle,
				"Cloned root node object should be different from the original",
			);

			// Clone a node inside the rectangle.
			const clonedTopLeft = TreeBeta.clone<typeof TestPoint>(topLeft);
			assert.deepEqual(topLeft, clonedTopLeft, "Inner node not cloned properly");
			assert.notEqual(topLeft, clonedTopLeft, "Cloned inner node object should be different");

			// Modify the original rectangle and validate that the clone is not modified.
			rectangle.topLeft = new TestPoint({ x: 2, y: 2 });
			assert.deepEqual(
				clonedRectangle.topLeft,
				topLeft,
				"The cloned node should not be modified when the original changes",
			);
		});

		it("clones hydrated nodes", () => {
			const view = getView(new TreeViewConfiguration({ schema: TestRectangle }));

			const topLeft = new TestPoint({ x: 1, y: 1 });
			const bottomRight = new TestPoint({ x: 10, y: 10 });
			view.initialize({ topLeft, bottomRight, innerPoints: [] });
			const rectangle = view.root;

			// Clone the hydrated root rectangle node.
			const clonedRectangle = TreeBeta.clone<typeof TestRectangle>(rectangle);
			assert.deepEqual(rectangle, clonedRectangle, "Root node not cloned properly");
			assert.notEqual(
				rectangle,
				clonedRectangle,
				"Cloned root node object should be different from the original",
			);

			// Create a new node and insert it.
			const innerPoint1 = new TestPoint({ x: 2, y: 2 });
			rectangle.innerPoints.insertAtEnd(innerPoint1);

			// Clone the new node inside the rectangle.
			const point1 = rectangle.innerPoints.at(0);
			assert(point1 !== undefined, "Point not inserted correctly");
			const clonedPoint1 = TreeBeta.clone<typeof TestPoint>(point1);
			assert.deepEqual(point1, clonedPoint1, "Inner node not cloned properly");
			assert.notEqual(point1, clonedPoint1, "Cloned inner node object should be different");

			// Modify the original rectangle and validate that the clone is not modified.
			rectangle.topLeft = new TestPoint({ x: 2, y: 2 });
			assert.deepEqual(
				clonedRectangle.topLeft,
				topLeft,
				"The cloned node should not be modified when the original changes",
			);
		});

		it("clones unhydrated primitive types", () => {
			const point = new TestPoint({ x: 1, y: 1, metadata: "unhydratedPoint" });
			const clonedX = TreeBeta.clone<typeof schema.number>(point.x);
			assert.equal(clonedX, point.x, "Number not cloned properly");

			assert(point.metadata !== undefined, "Metadata not set correctly");
			const clonedMetadata = TreeBeta.clone<typeof schema.string>(point.metadata);
			assert.equal(clonedMetadata, point.metadata, "String not cloned properly");
		});

		it("clones hydrated primitive types", () => {
			const view = getView(new TreeViewConfiguration({ schema: TestRectangle }));

			const topLeft = new TestPoint({ x: 1, y: 1 });
			const bottomRight = new TestPoint({ x: 10, y: 10 });
			view.initialize({ topLeft, bottomRight, innerPoints: [] });

			const topLeftPoint = view.root.topLeft;
			const clonedX = TreeBeta.clone<typeof schema.number>(topLeftPoint.x);
			assert.equal(clonedX, topLeftPoint.x, "Number not cloned properly");

			topLeftPoint.metadata = "hydratedPoint";
			assert(topLeftPoint.metadata !== undefined, "Metadata not set correctly");
			const clonedMetadata = TreeBeta.clone<typeof schema.string>(topLeftPoint.metadata);
			assert.equal(clonedMetadata, topLeftPoint.metadata, "String not cloned properly");
		});

		describe("test-trees", () => {
			for (const testCase of testSimpleTrees) {
				it(testCase.name, () => {
					const tree = TreeAlpha.create<UnsafeUnknownSchema>(testCase.schema, testCase.root());
					const exported = TreeBeta.clone(tree);
					if (isTreeNode(tree)) {
						// New instance
						assert.notEqual(tree, exported);
					}
					expectTreesEqual(tree, exported);
				});
			}
		});
	});

	// create is mostly the same as node constructors which have their own tests, so just cover the new cases (optional and top level unions) here.
	describe("create", () => {
		it("undefined", () => {
			// Valid
			assert.equal(TreeAlpha.create(schema.optional([]), undefined), undefined);
			// Undefined where not allowed
			assert.throws(
				() => TreeAlpha.create(schema.required([]), undefined as never),
				validateUsageError(/undefined for non-optional field/),
			);
			// Undefined required, not provided
			assert.throws(
				() => TreeAlpha.create(schema.optional([]), 1 as unknown as undefined),
				validateUsageError(/incompatible/),
			);
		});

		it("union", () => {
			// Valid
			assert.equal(TreeAlpha.create([schema.null, schema.number], null), null);
			// invalid
			assert.throws(
				() => TreeAlpha.create([schema.null, schema.number], "x" as unknown as number),
				validateUsageError(/incompatible/),
			);
		});

		// Integration test object complex objects work (mainly covered by tests elsewhere)
		it("object", () => {
			const A = schema.object("A", { x: schema.number });
			const a = TreeAlpha.create(A, { x: 1 });
			assert.deepEqual(a, { x: 1 });
		});
	});

	describe("concise", () => {
		describe("importConcise", () => {
			it("undefined", () => {
				// Valid
				assert.equal(TreeAlpha.importConcise(schema.optional([]), undefined), undefined);
				// Undefined where not allowed
				assert.throws(
					() => TreeAlpha.importConcise(schema.required([]), undefined),
					validateUsageError(/Got undefined for non-optional field/),
				);
				// Undefined required, not provided
				assert.throws(
					() => TreeAlpha.importConcise(schema.optional([]), 1),
					validateUsageError(/incompatible with all of the types allowed/),
				);
			});

			it("union", () => {
				// Valid
				assert.equal(TreeAlpha.importConcise([schema.null, schema.number], null), null);
				// invalid
				assert.throws(
					() => TreeAlpha.importConcise([schema.null, schema.number], "x"),
					validateUsageError(/The provided data is incompatible/),
				);
			});

			it("object", () => {
				const A = schema.object("A", { x: schema.number });
				const a = TreeAlpha.importConcise(A, { x: 1 });
				assert.deepEqual(a, { x: 1 });
			});
		});

		describe("roundtrip", () => {
			for (const testCase of testSimpleTrees) {
				if (testCase.root() !== undefined) {
					it(testCase.name, () => {
						const tree = TreeAlpha.create<UnsafeUnknownSchema>(
							testCase.schema,
							testCase.root(),
						);
						assert(tree !== undefined);
						const exported = TreeAlpha.exportConcise(tree);
						if (testCase.ambiguous) {
							assert.throws(
								() => TreeAlpha.importConcise<UnsafeUnknownSchema>(testCase.schema, exported),
								validateUsageError(/compatible with more than one type/),
							);
						} else {
							const imported = TreeAlpha.importConcise<UnsafeUnknownSchema>(
								testCase.schema,
								exported,
							);
							expectTreesEqual(tree, imported);
						}
					});
				}
			}
		});

		describe("export-stored", () => {
			for (const testCase of testSimpleTrees) {
				if (testCase.root() !== undefined) {
					it(testCase.name, () => {
						const tree = TreeAlpha.create<UnsafeUnknownSchema>(
							testCase.schema,
							testCase.root(),
						);
						assert(tree !== undefined);
						const _exported = TreeAlpha.exportConcise(tree, { useStoredKeys: true });
						// We have nothing that imports concise trees with stored keys, so no validation here.
					});
				}
			}
		});
	});

	describe("verbose", () => {
		describe("importVerbose", () => {
			it("undefined", () => {
				// Valid
				assert.equal(TreeAlpha.importVerbose(schema.optional([]), undefined), undefined);
				// Undefined where not allowed
				assert.throws(
					() => TreeAlpha.importVerbose(schema.required([]), undefined),
					validateUsageError(/non-optional/),
				);
				// Undefined required, not provided
				assert.throws(
					() => TreeAlpha.importVerbose(schema.optional([]), 1),
					validateUsageError(/does not conform to schema/),
				);
			});

			it("union", () => {
				// Valid
				assert.equal(TreeAlpha.importVerbose([schema.null, schema.number], null), null);
				// invalid
				assert.throws(
					() => TreeAlpha.importVerbose([schema.null, schema.number], "x"),
					validateUsageError(/does not conform to schema/),
				);
			});

			it("object", () => {
				const A = schema.object("A", { x: schema.number });
				const a = TreeAlpha.importVerbose(A, { type: A.identifier, fields: { x: 1 } });
				assert.deepEqual(a, { x: 1 });
			});
		});

		describe("roundtrip", () => {
			for (const testCase of testSimpleTrees) {
				if (testCase.root() !== undefined) {
					it(testCase.name, () => {
						const tree = TreeAlpha.create<UnsafeUnknownSchema>(
							testCase.schema,
							testCase.root(),
						);
						assert(tree !== undefined);
						const exported = TreeAlpha.exportVerbose(tree);
						const imported = TreeAlpha.importVerbose(testCase.schema, exported);
						expectTreesEqual(tree, imported);
					});
				}
			}

			describe("with misaligned view and stored schema", () => {
				it("does not preserve additional optional fields", () => {
					// (because stored keys are not being used, see analogous test in roundtrip-stored)
					const sf1 = new SchemaFactoryAlpha("com.example");
					const sf2 = new SchemaFactoryAlpha("com.example");
					class Point2D extends sf1.object(
						"Point",
						{
							x: sf1.number,
							y: sf1.number,
						},
						{ allowUnknownOptionalFields: true },
					) {}
					class Point3D extends sf2.object("Point", {
						x: sf2.number,
						y: sf2.number,
						z: sf2.optional(sf2.number),
					}) {}

					const testTree = new Point3D({ x: 1, y: 2, z: 3 });
					const exported = TreeAlpha.exportVerbose(testTree);

					// TODO:AB#26720 The error here should be more clear.
					assert.throws(
						() => TreeAlpha.importVerbose(Point2D, exported),
						(error: Error) => validateAssertionError(error, /missing field info/),
					);
				});
			});
		});

		describe("roundtrip-stored", () => {
			for (const testCase of testSimpleTrees) {
				if (testCase.root() !== undefined) {
					it(testCase.name, () => {
						const tree = TreeAlpha.create<UnsafeUnknownSchema>(
							testCase.schema,
							testCase.root(),
						);
						assert(tree !== undefined);
						const exported = TreeAlpha.exportVerbose(tree, { useStoredKeys: true });
						const imported = TreeAlpha.importVerbose(testCase.schema, exported, {
							useStoredKeys: true,
						});
						expectTreesEqual(tree, imported);
					});
				}
			}

			describe("with misaligned view and stored schema", () => {
				const sf1 = new SchemaFactoryAlpha("com.example");
				class Point3D extends sf1.object("Point", {
					x: sf1.number,
					y: sf1.number,
					z: sf1.optional(sf1.number),
				}) {}

				it("preserves additional allowed optional fields", () => {
					const sf2 = new SchemaFactoryAlpha("com.example");

					class Point2D extends sf2.object(
						"Point",
						{
							x: sf2.number,
							y: sf2.number,
						},
						{ allowUnknownOptionalFields: true },
					) {}
					const testTree = new Point3D({ x: 1, y: 2, z: 3 });
					const exported = TreeAlpha.exportVerbose(testTree, { useStoredKeys: true });
					const imported = TreeAlpha.importVerbose(Point2D, exported, { useStoredKeys: true });
					const exported2 = TreeAlpha.exportVerbose(imported, { useStoredKeys: true });
					const imported2 = TreeAlpha.importVerbose(Point3D, exported2, {
						useStoredKeys: true,
					});
					assert.deepEqual(exported, exported2);
					assert.deepEqual(Object.keys(imported), ["x", "y"]);
					assert.deepEqual(Object.keys(imported2), ["x", "y", "z"]);
					assert.equal(imported2.z, 3);
				});

				it("errors on additional disallowed optional fields", () => {
					const sf2 = new SchemaFactoryAlpha("com.example");

					class Point2D extends sf2.object(
						"Point",
						{
							x: sf2.number,
							y: sf2.number,
						},
						{ allowUnknownOptionalFields: false },
					) {}
					const testTree = new Point3D({ x: 1, y: 2, z: 3 });
					const exported = TreeAlpha.exportVerbose(testTree, { useStoredKeys: true });

					assert.throws(
						() => TreeAlpha.importVerbose(Point2D, exported, { useStoredKeys: true }),
						/Tree does not conform to schema./,
					);
				});
			});
		});
	});

	describe("compressed", () => {
		describe("roundtrip", () => {
			for (const testCase of testSimpleTrees) {
				if (testCase.root() !== undefined) {
					it(testCase.name, () => {
						const tree = TreeAlpha.create<UnsafeUnknownSchema>(
							testCase.schema,
							testCase.root(),
						);
						assert(tree !== undefined);
						const exported = TreeAlpha.exportCompressed(tree, {
							oldestCompatibleClient: FluidClientVersion.v2_0,
						});
						const imported = TreeAlpha.importCompressed(testCase.schema, exported, {
							jsonValidator: ajvValidator,
						});
						expectTreesEqual(tree, imported);
					});
				}
			}
		});
	});
});

function expectTreesEqual(
	a: TreeNode | TreeLeafValue | undefined,
	b: TreeNode | TreeLeafValue | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a === undefined, b === undefined);
		return;
	}

	// Validate the same schema objects are used.
	assert.equal(Tree.schema(a), Tree.schema(b));

	// This should catch all cases, assuming exportVerbose works correctly.
	assert.deepEqual(TreeAlpha.exportVerbose(a), TreeAlpha.exportVerbose(b));

	// Since this uses some of the tools to compare trees that this is testing for, perform the comparison in a few ways to reduce risk of a bug making this pass when it shouldn't:
	// This case could have false negatives (two trees with ambiguous schema could export the same concise tree),
	// but should have no false positives since equal trees always have the same concise tree.
	assert.deepEqual(TreeAlpha.exportConcise(a), TreeAlpha.exportConcise(b));
}

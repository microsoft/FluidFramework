/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../domains";
import { ProxyNode, typeNameSymbol } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { extractFactoryContent } from "../../../feature-libraries/editable-tree-2/proxies/proxies";
import { createTreeView2, itWithRoot } from "./utils";

describe("SharedTreeObject factories", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const childA = sb.object("childA", {
		content: sb.number,
	});

	const childB = sb.object("childB", {
		content: sb.number,
	});

	const childOptional = sb.object("childOptional", {
		content: sb.optional(sb.number),
	});

	const childD = sb.object("childD", {
		list: sb.list([childA, childB]),
		map: sb.map([childA, childB]),
	});

	const childC = sb.object("childC", {
		child: childD,
	});

	const parent = sb.object("parent", {
		child: childA,
		poly: [childA, childB],
		list: sb.list(sb.number),
		map: sb.map(sb.number),
		optional: sb.optional(childOptional),
		grand: childC,
	});

	const schema = sb.intoSchema(parent);

	const initialTree = {
		// TODO:#5928: Remove need for typeNameSymbol by calling factory function instead
		child: { [typeNameSymbol]: "test.childA", content: 42 },
		poly: { [typeNameSymbol]: "test.childB", content: 42 },
		list: [42, 42, 42],
		map: new Map([
			["a", 0],
			["b", 1],
		]),
		grand: {
			child: {
				list: [
					{ [typeNameSymbol]: "test.childA", content: 42 },
					{ [typeNameSymbol]: "test.childB", content: 42 },
				],
				map: new Map([
					["a", { [typeNameSymbol]: "test.childA", content: 42 }],
					["b", { [typeNameSymbol]: "test.childB", content: 42 }],
				]),
			},
		},
	};

	itWithRoot("correctly construct objects with content", schema, initialTree, (root) => {
		root.child = childA.create({ content: 43 });
		assert.equal(root.child.content, 43);
	});

	itWithRoot("construct objects that work in polymorphic fields", schema, initialTree, (root) => {
		root.poly = childA.create({ content: 43 });
		assert.equal(root.poly.content, 43);
		root.poly = childB.create({ content: 44 });
		assert.equal(root.poly.content, 44);
	});

	itWithRoot("can re-use content objects", schema, initialTree, (root) => {
		// The `create` functions stamp the content with a `[typeNameSymbol]`.
		// This test ensures that they shallow copy the content before doing the stamp.
		const content = { content: 43 };
		root.poly = childA.create(content);
		content.content = 44;
		root.poly = childB.create(content);
		assert.equal(root.poly.content, 44);
	});

	itWithRoot("don't require optional data to be included", schema, initialTree, (root) => {
		assert.equal(root.optional, undefined);
		root.optional = {};
		assert.deepEqual(root.optional, {});
		assert.equal(root.optional.content, undefined);
	});

	itWithRoot("support nesting inside of a factory", schema, initialTree, (root) => {
		root.grand = childC.create({
			child: childD.create({
				list: [childA.create({ content: 43 }), childB.create({ content: 43 })],
				map: new Map([
					["a", childA.create({ content: 43 })],
					["b", childB.create({ content: 43 })],
				]),
			}),
		});
		assert.deepEqual(root.grand.child.list, [{ content: 43 }, { content: 43 }]);
		assert.deepEqual(root.grand.child.map.get("a"), { content: 43 });
		assert.deepEqual(root.grand.child.map.get("b"), { content: 43 });
	});

	itWithRoot(
		"support nesting inside of a plain javascript object",
		schema,
		initialTree,
		(root) => {
			root.grand = {
				child: childD.create({
					list: [childA.create({ content: 43 }), childB.create({ content: 43 })],
					map: new Map([
						["a", childA.create({ content: 43 })],
						["b", childB.create({ content: 43 })],
					]),
				}),
			};
			assert.deepEqual(root.grand.child.list, [{ content: 43 }, { content: 43 }]);
			assert.deepEqual(root.grand.child.map.get("a"), { content: 43 });
			assert.deepEqual(root.grand.child.map.get("b"), { content: 43 });
		},
	);

	describe("factory content extraction", () => {
		it("extracts a primitive", () => {
			assert.equal(extractFactoryContent(42).content, 42);
		});
		it("extracts an object", () => {
			assert.deepEqual(extractFactoryContent(childA.create({ content: 42 })).content, {
				content: 42,
			});
		});
		it("extracts an array of primitives", () => {
			assert.deepEqual(extractFactoryContent([42, 42]).content, [42, 42]);
		});
		it("extracts an array of objects", () => {
			assert.deepEqual(
				extractFactoryContent([
					childA.create({ content: 42 }),
					childA.create({ content: 42 }),
				]).content,
				[{ content: 42 }, { content: 42 }],
			);
		});
		it("extracts an array of maps", () => {
			assert.deepEqual(extractFactoryContent([new Map([["a", 42]])]).content, [
				new Map([["a", 42]]),
			]);
		});
		it("extracts a map of primitives", () => {
			assert.deepEqual(
				extractFactoryContent(new Map([["a", 42]])).content,
				new Map([["a", 42]]),
			);
		});
		it("extracts a map of objects", () => {
			assert.deepEqual(
				extractFactoryContent(new Map([["a", childA.create({ content: 42 })]])).content,
				new Map([["a", { content: 42 }]]),
			);
		});
		it("extracts a map of arrays", () => {
			assert.deepEqual(
				extractFactoryContent(new Map([["a", [42]]])).content,
				new Map([["a", [42]]]),
			);
		});
		it("extracts an object tree", () => {
			assert.deepEqual(
				extractFactoryContent(
					childC.create({
						child: childD.create({
							list: [childA.create({ content: 42 })],
							map: new Map([["a", childA.create({ content: 42 })]]),
						}),
					}),
				).content,
				{
					child: { list: [{ content: 42 }], map: new Map([["a", { content: 42 }]]) },
				},
			);
		});
	});

	it("produce proxies that can be read after insertion", () => {
		// This schema is meant to be a large tree which has all the various combinations of types.
		// E.g. "objects with lists", "lists of maps", "maps of lists", "lists of lists", etc.
		const comboSchemaBuilder = new SchemaBuilder({ scope: "combo" });
		const comboObject = comboSchemaBuilder.object("Object", {
			primitive: comboSchemaBuilder.null,
		});
		const comboChild = comboSchemaBuilder.object("Child", {
			primitive: comboSchemaBuilder.null,
			object: comboObject,
			objectList: comboSchemaBuilder.list(comboObject),
			objectMap: comboSchemaBuilder.map(comboObject),
			listList: comboSchemaBuilder.list(comboSchemaBuilder.list(comboObject)),
			listMap: comboSchemaBuilder.map(comboSchemaBuilder.list(comboObject)),
			mapList: comboSchemaBuilder.list(comboSchemaBuilder.map(comboObject)),
			mapMap: comboSchemaBuilder.map(comboSchemaBuilder.map(comboObject)),
		});
		const comboParent = comboSchemaBuilder.object("Parent", {
			primitive: comboSchemaBuilder.null,
			object: comboChild,
			objectList: comboSchemaBuilder.list(comboChild),
			objectMap: comboSchemaBuilder.map(comboChild),
			listList: comboSchemaBuilder.list(comboSchemaBuilder.list(comboChild)),
			listMap: comboSchemaBuilder.map(comboSchemaBuilder.list(comboChild)),
			mapList: comboSchemaBuilder.list(comboSchemaBuilder.map(comboChild)),
			mapMap: comboSchemaBuilder.map(comboSchemaBuilder.map(comboChild)),
		});
		const deepSchema = comboSchemaBuilder.intoSchema(
			// TODO: This extra root won't be necessary once the true root of the tree is settable
			comboSchemaBuilder.object("root", { root: comboSchemaBuilder.optional(comboParent) }),
		);

		type ComboParent = ProxyNode<typeof comboParent>;
		type ComboChild = ProxyNode<typeof comboChild>;
		type ComboObject = ProxyNode<typeof comboObject>;

		/** Iterates through all the SharedTreeObjects in the combo tree */
		function* walkObjectTree(
			object: ComboParent | ComboChild | ComboObject,
		): IterableIterator<ComboParent | ComboChild | ComboObject> {
			yield object;
			if ("object" in object) {
				yield* walkObjectTree(object.object);
				for (const item of object.objectList) {
					yield* walkObjectTree(item);
				}
				for (const value of object.objectMap.values()) {
					yield* walkObjectTree(TODO(value));
				}
				for (const list of object.listList) {
					for (const item of list) {
						yield* walkObjectTree(item);
					}
				}
				for (const list of object.listMap.values()) {
					for (const item of TODO(list)) {
						yield* walkObjectTree(item);
					}
				}
				for (const map of object.mapList) {
					for (const item of map.values()) {
						yield* walkObjectTree(TODO(item));
					}
				}
				for (const map of object.mapMap.values()) {
					for (const item of TODO(map).values()) {
						yield* walkObjectTree(TODO(item));
					}
				}
			}
		}

		function createComboParent(): ComboParent {
			return comboParent.create({
				primitive: null,
				object: createComboChild(),
				objectList: [createComboChild(), createComboChild()],
				objectMap: new Map([
					["A", createComboChild()],
					["B", createComboChild()],
				]),
				listList: [
					[createComboChild(), createComboChild()],
					[createComboChild(), createComboChild()],
				],
				listMap: new Map([
					["A", [createComboChild(), createComboChild()]],
					["B", [createComboChild(), createComboChild()]],
				]),
				mapList: [
					new Map([
						["A", createComboChild()],
						["B", createComboChild()],
					]),
					new Map([
						["A", createComboChild()],
						["B", createComboChild()],
					]),
				],
				mapMap: new Map([
					[
						"A",
						new Map([
							["A", createComboChild()],
							["B", createComboChild()],
						]),
					],
					[
						"B",
						new Map([
							["A", createComboChild()],
							["B", createComboChild()],
						]),
					],
				]),
			});
		}

		function createComboChild(): ComboChild {
			return comboChild.create({
				primitive: null,
				object: createComboObject(),
				objectList: [createComboObject(), createComboObject()],
				objectMap: new Map([
					["A", createComboObject()],
					["B", createComboObject()],
				]),
				listList: [
					[createComboObject(), createComboObject()],
					[createComboObject(), createComboObject()],
				],
				listMap: new Map([
					["A", [createComboObject(), createComboObject()]],
					["B", [createComboObject(), createComboObject()]],
				]),
				mapList: [
					new Map([
						["A", createComboObject()],
						["B", createComboObject()],
					]),
					new Map([
						["A", createComboObject()],
						["B", createComboObject()],
					]),
				],
				mapMap: new Map([
					[
						"A",
						new Map([
							["A", createComboObject()],
							["B", createComboObject()],
						]),
					],
					[
						"B",
						new Map([
							["A", createComboObject()],
							["B", createComboObject()],
						]),
					],
				]),
			});
		}

		function createComboObject() {
			return comboObject.create({ primitive: null });
		}

		function TODO<T>(t: T | undefined): T {
			return t as T;
		}

		const view = createTreeView2(deepSchema, { root: undefined });
		const insertTree = createComboParent();
		view.root.root = insertTree;
		const objectsFromInsert = [...walkObjectTree(insertTree)];
		const objectsFromRoot = [...walkObjectTree(view.root.root)];
		assert.equal(objectsFromInsert.length, objectsFromRoot.length);
		for (let i = 0; i < objectsFromInsert.length; i++) {
			// The proxies that were inserted and the proxies in the tree are the same object and both can be read
			assert.equal(objectsFromInsert[i], objectsFromRoot[i]);
			assert.equal(objectsFromInsert[i].primitive, objectsFromRoot[i].primitive);
		}
	});
});

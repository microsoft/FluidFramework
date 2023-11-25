/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../domains";
import { typeNameSymbol } from "../../feature-libraries";
import { TypedNode, Tree } from "../../simple-tree";
// eslint-disable-next-line import/no-internal-modules
import { extractFactoryContent } from "../../simple-tree/proxies";
import { treeViewWithContent } from "../utils";
import { itWithRoot } from "./utils";

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

	const parentA = sb.object("parent", {
		child: childA,
		poly: [childA, childB],
		list: sb.list(sb.number),
		map: sb.map(sb.number),
		optional: sb.optional(childOptional),
		grand: childC,
	});

	const schema = sb.intoSchema(parentA);

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

	it("produce proxies that are hydrated before the tree can be read", () => {
		// This regression test ensures that proxies can be produced by reading the tree during change events.
		// Previously, this was not handled correctly because proxies would not be hydrated until after all change
		// events fired. If a user read the tree during a change event and produced a proxy, that proxy would not
		// be the same as the one that is about to be hydrated for the same underlying edit node, and thus hydration
		// would fail because it tried to map an edit node which already had a proxy to a different proxy.
		// TODO: remove any cast when `viewWithContent` is properly typed with proxy types
		const view = treeViewWithContent({ schema, initialTree: initialTree as any });
		function readData() {
			const objectContent = view.root.child.content;
			assert(objectContent !== undefined);
			const listContent = view.root.grand.child.list[view.root.grand.child.list.length - 1];
			assert(listContent !== undefined);
			const mapContent = view.root.grand.child.map.get("a");
			assert(mapContent !== undefined);
		}
		Tree.on(view.root, "beforeChange", () => {
			readData();
		});
		Tree.on(view.root, "afterChange", () => {
			readData();
		});
		view.events.on("afterBatch", () => {
			readData();
		});
		const content = { content: 3 };
		view.root.child = childA.create(content);
		view.root.grand.child.list.insertAtEnd(childA.create(content));
		view.root.grand.child.map.set("a", childA.create(content));
	});

	describe("produce proxies that can be read after insertion for trees of", () => {
		// This suite ensures that object proxies created via `foo.create` are "hydrated" after they are inserted into the tree.
		// After insertion, each of those proxies should be the same object as the corresponding proxy in the tree.

		// This schema allows trees of all the various combinations of containers.
		// For example, "objects with lists", "lists of maps", "maps of lists", "lists of lists", etc.
		// It will be used below to generate test cases of the various combinations.
		// TODO: This could be a recursive schema, but it's not because the recursive APIs are painful.
		const comboSchemaBuilder = new SchemaBuilder({ scope: "combo" });
		const comboLeaf = comboSchemaBuilder.object("Leaf", {
			id: comboSchemaBuilder.number,
		});
		const comboChild = comboSchemaBuilder.object("Child", {
			id: comboSchemaBuilder.number,
			content: [
				comboLeaf,
				comboSchemaBuilder.list(comboLeaf),
				comboSchemaBuilder.map(comboLeaf),
			],
		});
		const comboParent = comboSchemaBuilder.object("Parent", {
			id: comboSchemaBuilder.number,
			content: [
				comboChild,
				comboSchemaBuilder.list(comboChild),
				comboSchemaBuilder.map(comboChild),
			],
		});
		const comboRoot = comboSchemaBuilder.object("Root", {
			id: comboSchemaBuilder.number,
			content: [
				comboParent,
				comboSchemaBuilder.list(comboParent),
				comboSchemaBuilder.map(comboParent),
			],
		});
		const comboSchema = comboSchemaBuilder.intoSchema(
			// TODO: This extra root won't be necessary once the true root of the tree is settable
			comboSchemaBuilder.object("root", { root: comboSchemaBuilder.optional(comboRoot) }),
		);

		type ComboRoot = TypedNode<typeof comboRoot>;
		type ComboParent = TypedNode<typeof comboParent>;
		type ComboChild = TypedNode<typeof comboChild>;
		type ComboLeaf = TypedNode<typeof comboLeaf>;
		type ComboObject = ComboRoot | ComboParent | ComboChild | ComboLeaf;

		/** Iterates through all the objects in a combo tree */
		function* walkComboObjectTree(object: ComboObject): IterableIterator<ComboObject> {
			yield object;
			if ("content" in object) {
				const { content } = object;
				if (content instanceof Map) {
					for (const value of content.values()) {
						yield* walkComboObjectTree(value);
					}
				} else if (Array.isArray(content)) {
					for (const item of content) {
						yield* walkComboObjectTree(item);
					}
				} else {
					yield* walkComboObjectTree(content as ComboObject);
				}
			}
		}

		/**
		 * Defines the structure of a combo tree.
		 * @example
		 * A layout of
		 * ```json
		 * { "root": "list", "parent": "object", "child": "map" }
		 * ```
		 * defines a combo tree which is a list of objects containing maps.
		 */
		interface ComboTreeLayout {
			root: "object" | "list" | "map";
			parent: "object" | "list" | "map";
			child: "object" | "list" | "map";
		}

		/**
		 * Builds trees of {@link ComboObject}s according to the given {@link ComboTreeLayout}.
		 * Records all built objects and assigns each a unique ID.
		 */
		function createComboTree(layout: ComboTreeLayout) {
			const objects: ComboObject[] = [];
			let nextId = 0;

			function createComboRoot(): ComboRoot {
				const parent = createComboParent();
				const root = comboRoot.create({
					id: nextId++,
					content:
						layout.parent === "map"
							? new Map([["key", parent]])
							: layout.parent === "list"
							? [parent]
							: parent,
				});
				objects.push(root);
				return root;
			}

			function createComboParent(): ComboParent {
				const child = createComboChild();
				const parent = comboParent.create({
					id: nextId++,
					content:
						layout.parent === "map"
							? new Map([["key", child]])
							: layout.parent === "list"
							? [child]
							: child,
				});
				objects.push(parent);
				return parent;
			}

			function createComboChild(): ComboChild {
				const leaf = createComboLeaf();
				const child = comboChild.create({
					id: nextId++,
					content:
						layout.child === "map"
							? new Map([["key", leaf]])
							: layout.child === "list"
							? [leaf]
							: leaf,
				});
				objects.push(child);
				return child;
			}

			function createComboLeaf(): ComboLeaf {
				const leaf = comboLeaf.create({ id: nextId++ });
				objects.push(leaf);
				return leaf;
			}

			return { tree: createComboRoot(), objects };
		}

		const objectTypes = ["object", "list", "map"] as const;
		for (const root of objectTypes) {
			for (const parent of objectTypes) {
				for (const child of objectTypes) {
					// Generate a test for all permutations of object, list and map
					it(`${root} → ${parent} → ${child}`, () => {
						const view = treeViewWithContent({
							schema: comboSchema,
							initialTree: { root: undefined },
						});
						const { tree, objects: rawObjects } = createComboTree({
							root,
							parent,
							child,
						});
						for (const object of rawObjects) {
							// Before insertion, inspecting a raw object should fail
							assert.throws(() => object.id);
						}

						function validate(): void {
							assert(view.root.root !== undefined);
							const treeObjects = [...walkComboObjectTree(view.root.root)];
							assert.equal(rawObjects.length, treeObjects.length);
							// Sort the objects we built in the same way as the objects in the tree so that we can compare them below
							rawObjects.sort((a, b) => a.id - b.id);
							treeObjects.sort((a, b) => a.id - b.id);
							for (let i = 0; i < rawObjects.length; i++) {
								assert.equal(rawObjects[i].id, treeObjects[i].id);
								// Each raw object should be reference equal (not merely deeply equal) to the corresponding object in the tree.
								assert.equal(rawObjects[i], treeObjects[i]);
							}
						}

						// Ensure that the proxies can be read during the change, as well as after
						Tree.on(view.root, "afterChange", () => validate());
						view.events.on("afterBatch", () => validate());
						view.root.root = tree;
						validate();
					});
				}
			}
		}
	});
});

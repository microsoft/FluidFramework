/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { unreachableCase } from "@fluidframework/core-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { Tree, TreeConfiguration, TreeView } from "../../class-tree";
import {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	NodeBase,
	NodeFromSchema,
	TreeFieldFromImplicitField,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../class-tree/schemaTypes";
import {
	SchemaFactory,
	// eslint-disable-next-line import/no-internal-modules
} from "../../class-tree/schemaFactory";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../util";
import { TreeFactory } from "../../treeFactory";

{
	const schema = new SchemaFactory("Blah");

	class Note extends schema.object("Note", { text: schema.string }) {}

	class NodeMap extends schema.map("Notes", Note) {}
	class NodeList extends schema.array("Notes", Note) {}

	// eslint-disable-next-line no-inner-declarations
	function f(n: NodeMap): void {
		const item = n.get("x");
	}

	// Leaf stuff
	{
		const x = schema.string;
		type _check = requireAssignableTo<typeof schema.string, TreeNodeSchema>;
	}

	// TreeNodeFromImplicitAllowedTypes
	{
		type _check = requireAssignableTo<typeof Note, TreeNodeSchema>;
		type Test = TreeNodeFromImplicitAllowedTypes<typeof Note>;
		type Instance = InstanceType<typeof Note>;
		type _check2 = requireTrue<areSafelyAssignable<Test, Note>>;

		type _check3 = requireTrue<
			areSafelyAssignable<TreeNodeFromImplicitAllowedTypes<[typeof Note]>, Note>
		>;
		type _check4 = requireTrue<
			areSafelyAssignable<TreeNodeFromImplicitAllowedTypes<[() => typeof Note]>, Note>
		>;

		type FromArray = TreeNodeFromImplicitAllowedTypes<[typeof Note, typeof Note]>;
		type _check5 = requireTrue<areSafelyAssignable<FromArray, Note>>;
	}

	// TreeFieldFromImplicitField
	{
		type _check = requireAssignableTo<typeof Note, TreeNodeSchema>;
		type Test = TreeFieldFromImplicitField<typeof Note>;
		type Instance = InstanceType<typeof Note>;
		type _check2 = requireTrue<areSafelyAssignable<Test, Note>>;

		type _check3 = requireTrue<
			areSafelyAssignable<TreeFieldFromImplicitField<[typeof Note]>, Note>
		>;
		type _check4 = requireTrue<
			areSafelyAssignable<TreeFieldFromImplicitField<[() => typeof Note]>, Note>
		>;

		type FromArray = TreeFieldFromImplicitField<[typeof Note, typeof Note]>;
		type _check5 = requireTrue<areSafelyAssignable<FromArray, Note>>;
	}
}

describe("schemaFactory", () => {
	it("leaf", () => {
		const schema = new SchemaFactory("com.example");

		const config = new TreeConfiguration(schema.number, () => 5);

		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view = tree.schematize(config);
		assert.equal(view.root, 5);
	});

	it("instanceof", () => {
		const schema = new SchemaFactory("com.example");

		const config = new TreeConfiguration(schema.number, () => 5);

		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		class A extends schema.object("A", {}) {}
		class B extends schema.object("B", {}) {}

		const a = new A({});
		assert(a instanceof A);
		assert(!(a instanceof B));

		// TODO: this should be a compile error, but current API is structurally typed, and doesn't include the schema of nodes in that.
		const b: A = new B({});
	});

	describe("object", () => {
		it("simple end to end", () => {
			const schema = new SchemaFactory("com.example");
			class Point extends schema.object("Point", {
				x: schema.number,
				y: schema.number,
			}) {}

			const config = new TreeConfiguration(Point, () => new Point({ x: 1, y: 2 }));

			const factory = new TreeFactory({});
			const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
			const root = tree.schematize(config).root;
			assert.equal(root.x, 1);
			assert.equal(root.y, 2);

			const values: number[] = [];
			Tree.on(root, "afterChange", () => {
				values.push(root.x);
			});
			root.x = 5;
			assert.equal(root.x, 5);
			assert.deepEqual(values, [5]);
		});

		it("custom members", () => {
			const schema = new SchemaFactory("com.example");
			class Point extends schema.object("Point", {
				x: schema.number,
			}) {
				public selected = false;

				public toggle(): boolean {
					this.selected = !this.selected;
					return this.selected;
				}

				public increment(): number {
					return this.x++;
				}
			}

			const config = new TreeConfiguration(Point, () => new Point({ x: 1 }));

			const factory = new TreeFactory({});
			const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
			const root = tree.schematize(config).root;
			assert.equal(root.x, 1);

			const values: number[] = [];
			Tree.on(root, "afterChange", () => {
				values.push(root.x);
			});

			assert(root instanceof Point);
			assert(root instanceof NodeBase);
			assert(Reflect.has(root, "selected"));
			assert.equal(root.selected, false);
			// Ensure modification works
			root.selected = true;
			assert.equal(root.selected, true);
			// Ensure methods work
			assert.equal(root.toggle(), false);
			// Ensure methods and direct access observe same property.
			assert.equal(root.selected, false);

			// Ensure methods can access tree content
			assert.equal(root.increment(), 1);
			assert.equal(root.increment(), 2);
			assert.deepEqual(values, [2, 3]);
		});

		describe("deep equality", () => {
			const schema = new SchemaFactory("com.example");

			class Item extends schema.object("Item", {
				x: schema.number,
				y: schema.number,
			}) {}
			class Point extends schema.object("Point", {
				x: schema.number,
				y: schema.number,
			}) {}
			it("hydrated", () => {
				assert.deepEqual(hydrate(Point, { x: 1, y: 2 }), hydrate(Point, { x: 1, y: 2 }));
				// It should not matter if the object was unhydrated or just builder data:
				assert.deepEqual(
					hydrate(Point, new Point({ x: 1, y: 2 })),
					hydrate(Point, { x: 1, y: 2 }),
				);
				assert.notDeepEqual(hydrate(Point, { x: 1, y: 2 }), hydrate(Point, { x: 1, y: 3 }));
				assert.notDeepEqual(hydrate(Point, { x: 1, y: 2 }), { x: 1, y: 2 });
				assert.notDeepEqual(hydrate(Point, { x: 1, y: 2 }), hydrate(Item, { x: 1, y: 2 }));
			});

			it("local fields", () => {
				class WithLocals extends schema.object("WithLocals", {
					x: schema.number,
				}) {
					public extra = true;
					public method(): void {}
				}
				const p1 = hydrate(WithLocals, { x: 1 });
				const p2 = hydrate(WithLocals, { x: 1 });
				assert.deepEqual(p1, p2);
				p1.extra = false;
				assert.notDeepEqual(p1, p2);
			});

			// Walking unhydrated nodes is currently not supported
			it.skip("unhydrated", () => {
				assert.deepEqual(new Point({ x: 1, y: 2 }), new Point({ x: 1, y: 2 }));
				assert.notDeepEqual(new Point({ x: 1, y: 2 }), new Point({ x: 1, y: 3 }));
				assert.notDeepEqual(new Point({ x: 1, y: 2 }), { x: 1, y: 2 });
				assert.notDeepEqual(new Point({ x: 1, y: 2 }), hydrate(Item, { x: 1, y: 2 }));
			});
		});
	});

	it("mixed", () => {
		const schema = new SchemaFactory("com.example");

		class Point extends schema.object("Point", {
			x: schema.number,
			y: schema.number,
		}) {}

		class Note extends schema.object("Note", {
			text: schema.string,
			location: schema.optional(Point),
		}) {}

		class NodeMap extends schema.map("NoteMap", Note) {}
		class NodeList extends schema.array("NoteList", Note) {}

		class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

		const config = new TreeConfiguration(
			Canvas,
			() =>
				new Canvas({
					stuff: new NodeList([new Note({ text: "hi", location: undefined })]),
				}),
		);

		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<Canvas> = tree.schematize(config);
		const stuff = view.root.stuff;
		assert(stuff instanceof NodeList);
		const item = stuff[0];
		const s: string = item.text;
		assert.equal(s, "hi");
	});

	describe("List", () => {
		it("Nested List", () => {
			const builder = new SchemaFactory("test");

			class Inventory extends builder.object("Inventory", {
				parts: builder.array(builder.number),
			}) {}

			const treeConfiguration = new TreeConfiguration(
				Inventory,
				() =>
					new Inventory({
						parts: [1, 2],
					}),
			);

			const factory = new TreeFactory({});
			const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
			const view = tree.schematize(treeConfiguration);
		});

		const treeFactory = new TreeFactory({});

		it("Structural", () => {
			const factory = new SchemaFactory("test");

			// Explicit structural example
			const MyList = factory.array(factory.number);
			type MyList = NodeFromSchema<typeof MyList>;

			// Inline structural example
			factory.object("Foo", { myList: factory.array(factory.number) });

			function broken() {
				// @ts-expect-error structural list schema are not typed as classes.
				class NotAClass extends factory.array(factory.number) {}
			}
		});

		it("Named", () => {
			const factory = new SchemaFactory("test");
			class NamedList extends factory.array("name", factory.number) {
				public testProperty = false;
			}

			// Due to missing unhydrated list support, make a wrapper object
			class Parent extends factory.object("parent", { child: NamedList }) {}

			// Due to lack of support for navigating unhydrated nodes, create an actual tree so we can navigate to the list node:
			const treeConfiguration = new TreeConfiguration(
				Parent,
				() => new Parent({ child: [5] }),
			);
			const tree = treeFactory.create(new MockFluidDataStoreRuntime(), "tree");
			const view = tree.schematize(treeConfiguration);

			const listNode = view.root.child;
			assert(listNode instanceof NamedList);
			assert(listNode instanceof NodeBase);
			assert(Reflect.has(listNode, "testProperty"));
			assert.equal(listNode.testProperty, false);
			listNode.testProperty = true;
			assert.equal(listNode.testProperty, true);

			// Test method from list
			assert.equal(listNode.at(0), 5);
		});

		it("Unhydrated", () => {
			const factory = new SchemaFactory("test");
			class NamedList extends factory.array("name", factory.number) {}
			const namedInstance = new NamedList([5]);
		});
	});

	describe("Map", () => {
		const treeFactory = new TreeFactory({});

		it("Structural", () => {
			const factory = new SchemaFactory("test");

			// Explicit structural example
			const MyMap = factory.map(factory.number);
			type MyMap = NodeFromSchema<typeof MyMap>;

			// Inline structural example
			factory.object("Foo", { myMap: factory.map(factory.number) });

			function broken() {
				// @ts-expect-error structural map schema are not typed as classes.
				class NotAClass extends factory.map(factory.number) {}
			}
		});

		it("Named", () => {
			const factory = new SchemaFactory("test");
			class NamedMap extends factory.map("name", factory.number) {
				public testProperty = false;
			}

			// Due to missing unhydrated map support, make a wrapper object
			class Parent extends factory.object("parent", { child: NamedMap }) {}

			// Due to lack of support for navigating unhydrated nodes, create an actual tree so we can navigate to the map node:
			const treeConfiguration = new TreeConfiguration(
				Parent,
				() => new Parent({ child: new Map([["x", 5]]) }),
			);
			const tree = treeFactory.create(new MockFluidDataStoreRuntime(), "tree");
			const view = tree.schematize(treeConfiguration);

			const mapNode = view.root.child;
			assert(mapNode instanceof NamedMap);
			assert(mapNode instanceof NodeBase);
			assert(Reflect.has(mapNode, "testProperty"));
			assert.equal(mapNode.testProperty, false);
			mapNode.testProperty = true;
			assert.equal(mapNode.testProperty, true);

			// Test method from map
			assert.equal(mapNode.get("x"), 5);
		});

		it("Unhydrated", () => {
			const factory = new SchemaFactory("test");
			class NamedMap extends factory.map("name", factory.number) {}
			const namedInstance = new NamedMap(new Map([["x", 5]]));
		});
	});

	describe("produces proxies that can be read after insertion for trees of", () => {
		// This suite ensures that proxies created via `new X(...)` are "hydrated" after they are inserted into the tree.
		// After insertion, each of those proxies should be the same object as the corresponding proxy in the tree.

		// This schema allows trees of all the various combinations of containers.
		// For example, "objects with lists", "lists of maps", "maps of lists", "lists of lists", etc.
		// It will be used below to generate test cases of the various combinations.
		const comboSchemaFactory = new SchemaFactory("combo");
		class ComboChildObject extends comboSchemaFactory.object("comboObjectChild", {}) {}
		class ComboChildList extends comboSchemaFactory.array(
			"comboListChild",
			comboSchemaFactory.null,
		) {}
		class ComboChildMap extends comboSchemaFactory.map(
			"comboMapChild",
			comboSchemaFactory.null,
		) {}
		class ComboParentObject extends comboSchemaFactory.object("comboObjectParent", {
			child: [ComboChildObject, ComboChildList, ComboChildMap],
		}) {}
		class ComboParentList extends comboSchemaFactory.array("comboListParent", [
			ComboChildObject,
			ComboChildList,
			ComboChildMap,
		]) {}
		class ComboParentMap extends comboSchemaFactory.map("comboMapParent", [
			ComboChildObject,
			ComboChildList,
			ComboChildMap,
		]) {}
		class ComboRoot extends comboSchemaFactory.object("comboRoot", {
			root: comboSchemaFactory.optional([ComboParentObject, ComboParentList, ComboParentMap]),
		}) {}

		type ComboParent = ComboParentObject | ComboParentList | ComboParentMap;
		function isComboParent(value: unknown): value is ComboParent {
			return (
				value instanceof ComboParentObject ||
				value instanceof ComboParentList ||
				value instanceof ComboParentMap
			);
		}
		type ComboChild = ComboChildObject | ComboChildList | ComboChildMap;
		function isComboChild(value: unknown): value is ComboChild {
			return (
				value instanceof ComboChildObject ||
				value instanceof ComboChildList ||
				value instanceof ComboChildMap
			);
		}
		type ComboNode = ComboParent | ComboChild;

		/** Iterates through all the nodes in a combo tree */
		function* walkComboObjectTree(combo: ComboNode): IterableIterator<ComboNode> {
			yield combo;

			if (combo instanceof ComboParentObject) {
				yield* walkComboObjectTree(combo.child);
			} else if (combo instanceof ComboParentList) {
				for (const c of combo) {
					yield* walkComboObjectTree(c);
				}
			} else if (combo instanceof ComboParentMap) {
				for (const c of combo.values()) {
					yield* walkComboObjectTree(c);
				}
			}
		}

		/** Sorts parent nodes before child nodes */
		function compareComboNodes(a: ComboNode, b: ComboNode): -1 | 0 | 1 {
			if (isComboParent(a) && isComboChild(b)) {
				return 1;
			}
			if (isComboChild(a) && isComboParent(b)) {
				return -1;
			}
			return 0;
		}

		/**
		 * Defines the structure of a combo tree.
		 * @example
		 * A layout of
		 * ```json
		 * { "parent": "list", "child": "map" }
		 * ```
		 * defines a combo tree which is a list of maps.
		 */
		interface ComboTreeLayout {
			parentType: "object" | "list" | "map";
			childType: "object" | "list" | "map";
		}

		/**
		 * Builds trees of {@link ComboObject}s according to the given {@link ComboTreeLayout}.
		 * Records all built objects and assigns each a unique ID.
		 */
		function createComboTree(layout: ComboTreeLayout) {
			const nodes: ComboNode[] = [];
			function createComboParent(): ComboParent {
				const child = createComboChild();
				let parent: ComboParent;
				switch (layout.parentType) {
					case "object":
						parent = new ComboParentObject({ child });
						break;
					case "list":
						parent = new ComboParentList([child]);
						break;
					case "map":
						parent = new ComboParentMap(new Map([["child", child]]));
						break;
					default:
						unreachableCase(layout.parentType);
				}
				nodes.push(parent);
				return parent;
			}

			function createComboChild(): ComboChild {
				let child: ComboChild;
				switch (layout.childType) {
					case "object":
						child = new ComboChildObject({});
						break;
					case "list":
						child = new ComboChildList([]);
						break;
					case "map":
						child = new ComboChildMap(new Map());
						break;
					default:
						unreachableCase(layout.childType);
				}
				nodes.push(child);
				return child;
			}

			return { parent: createComboParent(), nodes };
		}

		const objectTypes = ["object", "list", "map"] as const;
		for (const parentType of objectTypes) {
			for (const childType of objectTypes) {
				// Generate a test for all permutations of object, list and map
				it(`${parentType} → ${childType}`, () => {
					const config = new TreeConfiguration(ComboRoot, () => ({ root: undefined }));
					const factory = new TreeFactory({});
					const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
					const view = tree.schematize(config);
					const { parent, nodes } = createComboTree({
						parentType,
						childType,
					});

					function validate(): void {
						assert(view.root.root !== undefined);
						const treeObjects = [...walkComboObjectTree(view.root.root)];
						assert.equal(treeObjects.length, nodes.length);
						// Sort the objects we built in the same way as the objects in the tree so that we can compare them below
						nodes.sort(compareComboNodes);
						treeObjects.sort(compareComboNodes);
						for (let i = 0; i < nodes.length; i++) {
							// Each raw object should be reference equal to the corresponding object in the tree.
							assert.equal(nodes[i], treeObjects[i]);
						}
					}

					// Ensure that the proxies can be read during the change, as well as after
					Tree.on(view.root, "afterChange", () => validate());
					view.events.on("afterBatch", () => validate());
					view.root.root = parent;
					validate();
				});
			}
		}
	});
});

/**
 * Create a tree and use it to hydrate the input.
 */
function hydrate<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	data: InsertableTreeFieldFromImplicitField<TSchema>,
): TreeFieldFromImplicitField<TSchema> {
	const config = new TreeConfiguration(schema, () => data);
	const factory = new TreeFactory({});
	const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
	const root = tree.schematize(config).root;
	return root;
}

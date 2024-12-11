/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { oob, unreachableCase } from "@fluidframework/core-utils/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	MockFluidDataStoreRuntime,
	MockHandle,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import { TreeStatus } from "../../../feature-libraries/index.js";
import {
	treeNodeApi as Tree,
	TreeViewConfiguration,
	type TreeArrayNode,
	type TreeMapNode,
	type TreeView,
} from "../../../simple-tree/index.js";
import {
	type TreeNodeSchema,
	type WithType,
	isTreeNode,
	NodeKind,
	// Import directly to get the non-type import to allow testing of the package only instanceof
	TreeNode,
	typeSchemaSymbol,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/core/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { ObjectNodeSchema } from "../../../simple-tree/objectNodeTypes.js";
import {
	SchemaFactory,
	schemaFromValue,
	withMetadata,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaFactory.js";
import type {
	NodeFromSchema,
	NodeSchemaMetadata,
	TreeFieldFromImplicitField,
	TreeNodeFromImplicitAllowedTypes,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/schemaTypes.js";
import { TreeFactory } from "../../../treeFactory.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
} from "../../../util/index.js";

import { hydrate } from "../utils.js";
import { validateUsageError } from "../../utils.js";

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

		const config = new TreeViewConfiguration({ schema: schema.number });

		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize(5);
		assert.equal(view.root, 5);
	});

	it("instanceof", () => {
		const schema = new SchemaFactory("com.example");

		class A extends schema.object("A", {}) {}
		class B extends schema.object("B", {}) {}
		const C = schema.object("C", {});
		const StructuralArray = schema.array(A);
		const NominalArray = schema.array("D", A);

		const a = new A({});
		assert(a instanceof A);
		assert(a instanceof TreeNode);
		assert(!(a instanceof B));

		// @ts-expect-error Nodes should get type based nominal typing.
		const b: A = new B({});

		const c = new C({});
		assert(c instanceof C);
		assert(c instanceof TreeNode);
		assert(!(c instanceof B));

		const n = new NominalArray([]);
		assert(n instanceof NominalArray);
		assert(n instanceof TreeNode);
		assert(!(n instanceof B));

		// Structurally typed and/or POJO mode types:
		const s = hydrate(StructuralArray, []);
		// This works correctly, but is currently rejected by the type system. This is fine as Tree.is can be used instead.
		assert(s instanceof (StructuralArray as never));
		// This case is expressible without type errors, so it is important that it works.
		assert(s instanceof TreeNode);
		assert(!(s instanceof B));
	});

	it("Scoped", () => {
		const factory = new SchemaFactory("test-scope");
		// We specified a scope in the factory, so it should be part of the type signature of the created object
		const foo = factory.object("foo", {}).identifier;
		type _check = requireTrue<areSafelyAssignable<"test-scope.foo", typeof foo>>;
		assert.equal(foo, "test-scope.foo");
	});

	it("Unscoped", () => {
		const factory = new SchemaFactory(undefined);
		// We did not specify a scope in the factory, so one should not be part of the type signature of the created object
		const foo = factory.object("foo", {}).identifier;
		type _check = requireTrue<areSafelyAssignable<"foo", typeof foo>>;
		assert.equal(foo, "foo");
	});

	it("Optional fields", () => {
		const factory = new SchemaFactory("test");
		class Foo extends factory.object("foo", {
			x: factory.optional(factory.number),
		}) {}

		const _check1 = new Foo({});
		const _check2 = new Foo({ x: undefined });
		const _check3 = new Foo({ x: 1 });
	});

	it("Required fields", () => {
		const factory = new SchemaFactory("test");
		class Foo extends factory.object("foo", {
			x: factory.required(factory.number),
		}) {}

		assert.throws(
			() => {
				// @ts-expect-error Missing required field
				const _check1 = new Foo({});
			},
			validateUsageError(/incompatible/),
		);

		assert.throws(
			() => {
				// @ts-expect-error Required field cannot be undefined
				const _check2 = new Foo({ x: undefined });
			},
			validateUsageError(/incompatible/),
		);

		const _check3 = new Foo({ x: 1 });
	});

	// Regression test to ensure generic type variations of the factory are assignable to its default typing.
	it("Typed factories are assignable to default typing", () => {
		type _check1 = requireTrue<
			requireAssignableTo<SchemaFactory<"Foo", "Bar">, SchemaFactory>
		>;
		type _check2 = requireTrue<requireAssignableTo<SchemaFactory<"Foo", 42>, SchemaFactory>>;
		type _check3 = requireTrue<
			requireAssignableTo<SchemaFactory<undefined, "Bar">, SchemaFactory>
		>;
		type _check4 = requireTrue<
			requireAssignableTo<SchemaFactory<undefined, 42>, SchemaFactory>
		>;
	});

	describe("object", () => {
		it("simple end to end", () => {
			const schema = new SchemaFactory("com.example");
			class Point extends schema.object("Point", {
				x: schema.number,
				y: schema.number,
			}) {}

			const config = new TreeViewConfiguration({ schema: Point });

			const factory = new TreeFactory({});
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(config);
			view.initialize(new Point({ x: 1, y: 2 }));
			const { root } = view;
			assert.equal(root.x, 1);
			assert.equal(root.y, 2);

			const values: number[] = [];
			Tree.on(root, "nodeChanged", () => {
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

			const config = new TreeViewConfiguration({ schema: Point });

			const factory = new TreeFactory({});
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(config);
			view.initialize(new Point({ x: 1 }));
			const { root } = view;
			assert.equal(root.x, 1);

			const values: number[] = [];
			Tree.on(root, "nodeChanged", () => {
				values.push(root.x);
			});

			assert(root instanceof Point);
			assert(isTreeNode(root));
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

		it("Stored key collision", () => {
			const schema = new SchemaFactory("com.example");
			assert.throws(
				() =>
					schema.object("Point", {
						x: schema.required(schema.number, { key: "foo" }),
						y: schema.required(schema.number, { key: "foo" }),
					}),
				(error: Error) =>
					validateAssertionError(
						error,
						/Duplicate stored key "foo" in schema "com.example.Point"/,
					),
			);
		});

		it("Stored key collides with property key", () => {
			const schema = new SchemaFactory("com.example");
			assert.throws(
				() =>
					schema.object("Object", {
						foo: schema.number,
						bar: schema.required(schema.string, { key: "foo" }),
					}),
				(error: Error) =>
					validateAssertionError(
						error,
						/Stored key "foo" in schema "com.example.Object" conflicts with a property key of the same name/,
					),
			);
		});

		// This is a somewhat neurotic test case, and likely not something we would expect a user to do.
		// But just in case, we should ensure it is handled correctly.
		it("Stored key / property key swap", () => {
			const schema = new SchemaFactory("com.example");
			assert.doesNotThrow(() =>
				schema.object("Object", {
					foo: schema.optional(schema.number, { key: "bar" }),
					bar: schema.required(schema.string, { key: "foo" }),
				}),
			);
		});

		it("Explicit stored key === property key", () => {
			const schema = new SchemaFactory("com.example");
			assert.doesNotThrow(() =>
				schema.object("Object", {
					foo: schema.optional(schema.string, { key: "foo" }),
				}),
			);
		});

		it("Field schema metadata", () => {
			const schemaFactory = new SchemaFactory("com.example");
			const barMetadata = {
				description: "Bar",
				custom: { prop1: "Custom metadata property." },
			};

			class Foo extends schemaFactory.object("Foo", {
				bar: schemaFactory.required(schemaFactory.number, { metadata: barMetadata }),
			}) {}

			const foo = hydrate(Foo, { bar: 37 });

			const schema = Tree.schema(foo) as ObjectNodeSchema;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			assert.deepEqual(schema.fields.get("bar")!.metadata, barMetadata);
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

			it("unhydrated", () => {
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

		const config = new TreeViewConfiguration({ schema: Canvas });

		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof Canvas> = tree.viewWith(config);
		view.initialize(
			new Canvas({
				stuff: new NodeList([new Note({ text: "hi", location: undefined })]),
			}),
		);
		const stuff = view.root.stuff;
		assert(stuff instanceof NodeList);
		const item = stuff[0] ?? oob();
		const s: string = item.text;
		assert.equal(s, "hi");
	});

	describe("Array", () => {
		it("Nested Array", () => {
			const builder = new SchemaFactory("test");

			class Inventory extends builder.object("Inventory", {
				parts: builder.array(builder.number),
			}) {}

			const treeConfiguration = new TreeViewConfiguration({ schema: Inventory });

			const factory = new TreeFactory({});
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(treeConfiguration);
			view.initialize(
				new Inventory({
					parts: [1, 2],
				}),
			);
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

			assert.equal(MyList.identifier, `test.Array<["${factory.number.identifier}"]>`);
		});

		it("Named", () => {
			const factory = new SchemaFactory("test");
			class NamedList extends factory.array("name", factory.number) {
				public testProperty = false;
			}

			// Due to missing unhydrated list support, make a wrapper object
			class Parent extends factory.object("parent", { child: NamedList }) {}

			// Due to lack of support for navigating unhydrated nodes, create an actual tree so we can navigate to the list node:
			const treeConfiguration = new TreeViewConfiguration({ schema: Parent });
			const tree = treeFactory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(treeConfiguration);
			view.initialize(new Parent({ child: [5] }));

			const listNode = view.root.child;
			assert(listNode instanceof NamedList);
			assert(isTreeNode(listNode));
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
			const treeConfiguration = new TreeViewConfiguration({ schema: Parent });
			const tree = treeFactory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(treeConfiguration);
			view.initialize(new Parent({ child: new Map([["x", 5]]) }));

			const mapNode = view.root.child;
			assert(mapNode instanceof NamedMap);
			assert(isTreeNode(mapNode));
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
			childA: [ComboChildObject, ComboChildList, ComboChildMap],
			childB: [ComboChildObject, ComboChildList, ComboChildMap],
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
			root: [ComboParentObject, ComboParentList, ComboParentMap],
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
				for (const child of Object.values(combo)) {
					yield* walkComboObjectTree(child);
				}
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
				const childA = createComboChild();
				const childB = createComboChild();
				let parent: ComboParent;
				switch (layout.parentType) {
					case "object":
						parent = new ComboParentObject({ childA, childB });
						break;
					case "list":
						parent = new ComboParentList([childA, childB]);
						break;
					case "map":
						parent = new ComboParentMap(
							new Map([
								["childA", childA],
								["childB", childB],
							]),
						);
						break;
					default:
						unreachableCase(layout.parentType);
				}
				nodes.push(parent);
				assert.equal(Tree.status(parent), TreeStatus.New);
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
				assert.equal(Tree.status(child), TreeStatus.New);
				return child;
			}

			return { parent: createComboParent(), nodes };
		}

		const objectTypes = ["object", "list", "map"] as const;
		function test(
			parentType: (typeof objectTypes)[number],
			childType: (typeof objectTypes)[number],
			validate: (view: TreeView<typeof ComboRoot>, nodes: ComboNode[]) => void,
		) {
			const config = new TreeViewConfiguration({ schema: ComboRoot });
			const factory = new TreeFactory({});
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);

			// Check that nodes in the initial tree are hydrated
			const view = tree.viewWith(config);
			const { parent: initialParent, nodes: initialNodes } = createComboTree({
				parentType,
				childType,
			});

			view.initialize({ root: initialParent });
			validate(view, initialNodes);

			// Check that nodes inserted later are hydrated
			const { parent: insertedParent, nodes: insertedNodes } = createComboTree({
				parentType,
				childType,
			});

			// Ensure that the proxies can be read during the change, as well as after
			// Note: as of 2024-03-28, we can't easily test 'treeChanged' because it can fire at a time where the changes
			// to the tree are not visible in the listener. 'nodeChanged' only fires once we confirmed that a
			// relevant change was actually applied to the tree so the side effects this test validates already happened.
			Tree.on(view.root, "nodeChanged", () => validate(view, insertedNodes));
			view.events.on("rootChanged", () => validate(view, insertedNodes));
			view.root.root = insertedParent;
			validate(view, insertedNodes);
		}

		for (const parentType of objectTypes) {
			for (const childType of objectTypes) {
				// Generate a test for all permutations of object, list and map
				it(`${parentType} → ${childType}`, () => {
					test(parentType, childType, (view, nodes) => {
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
					});
				});

				it(`${parentType} → ${childType} (bottom up)`, () => {
					test(parentType, childType, (_, nodes) => {
						// Sort the nodes bottom up, so that we will observe the children before demanding the parents.
						nodes.sort(compareComboNodes);
						for (let i = nodes.length - 1; i >= 0; i--) {
							const node = nodes[i];
							if (node instanceof ComboChildObject || node instanceof ComboParentObject) {
								Object.entries(node);
							} else if (node instanceof ComboChildList || node instanceof ComboParentList) {
								for (const __ of node.entries());
							} else if (node instanceof ComboChildMap || node instanceof ComboParentMap) {
								for (const __ of node.entries());
							}
							assert.equal(Tree.status(node), TreeStatus.InDocument);
						}
					});
				});
			}
		}
	});

	it("schemaFromValue", () => {
		const f = new SchemaFactory("");
		assert.equal(schemaFromValue(1), f.number);
		assert.equal(schemaFromValue(""), f.string);
		assert.equal(schemaFromValue(null), f.null);
		assert.equal(schemaFromValue(new MockHandle("x")), f.handle);
		assert.equal(schemaFromValue(false), f.boolean);
	});

	it("extra fields in object constructor", () => {
		const f = new SchemaFactory("");

		class Empty extends f.object("C", {}) {}

		// @ts-expect-error Invalid extra field
		// TODO: this should runtime error when constructed (not just when hydrated)
		const c2 = new Empty({ x: {} });

		class NonEmpty extends f.object("C", { a: f.null }) {}

		// @ts-expect-error Invalid extra field
		// TODO: this should error when constructed (not just when hydrated)
		new NonEmpty({ a: null, b: 0 });
	});

	it("object nested implicit construction", () => {
		const f = new SchemaFactory("");

		class C extends f.object("C", {}) {
			public readonly c = "X";
		}
		class B extends f.object("B", {
			b: C,
		}) {}
		class A extends f.object("A", {
			a: B,
		}) {}

		const tree = hydrate(A, { a: { b: {} } });
		assert.equal(tree.a.b.c, "X");
	});

	describe("multiple subclass use errors", () => {
		it("mixed configuration", () => {
			const schemaFactory = new SchemaFactory("");

			const base = schemaFactory.object("Foo", {});
			class Foo extends base {}
			assert.throws(
				() => {
					const config = new TreeViewConfiguration({ schema: [Foo, base] });
				},
				validateUsageError(/same SchemaFactory generated class/),
			);
		});

		it("mixed hydrate", () => {
			const schemaFactory = new SchemaFactory("");

			const base = schemaFactory.object("Foo", {});
			class Foo extends base {}
			const other = schemaFactory.array(base);

			assert.throws(
				() => {
					const tree_B = hydrate(other, [new Foo({})]);
				},
				validateUsageError(/same SchemaFactory generated class/),
			);
		});

		it("constructing", () => {
			const schemaFactory = new SchemaFactory("");

			const base = schemaFactory.object("Foo", {});
			class Foo extends base {}

			const _1 = new base({});

			assert.throws(
				() => {
					const _2 = new Foo({});
				},
				validateUsageError(/same SchemaFactory generated class/),
			);
		});

		it("constructing reversed", () => {
			const schemaFactory = new SchemaFactory("");

			const base = schemaFactory.object("Foo", {});
			class Foo extends base {}

			const _2 = new Foo({});

			assert.throws(
				() => {
					const _1 = new base({});
				},
				validateUsageError(/same SchemaFactory generated class/),
			);
		});

		it("mixed configs", () => {
			const schemaFactory = new SchemaFactory("");
			const base = schemaFactory.object("Foo", {});
			class Foo extends base {}
			const config = new TreeViewConfiguration({ schema: base });

			assert.throws(
				() => {
					const config2 = new TreeViewConfiguration({ schema: Foo });
				},
				validateUsageError(/same SchemaFactory generated class/),
			);
		});

		it("structural types", () => {
			const schemaFactory = new SchemaFactory("");
			const base = schemaFactory.object("Foo", {});
			class Foo extends base {}
			schemaFactory.array(base);
			assert.throws(
				() => {
					schemaFactory.array(Foo);
				},
				validateUsageError(/same SchemaFactory generated class/),
			);
		});

		it("indirect configs", () => {
			const schemaFactory = new SchemaFactory("");
			const base = schemaFactory.object("Foo", {});
			class Foo extends base {}
			const config = new TreeViewConfiguration({
				schema: schemaFactory.object("x", { x: base }),
			});
			assert.throws(
				() => {
					const config2 = new TreeViewConfiguration({
						schema: schemaFactory.map("x", Foo),
					});
				},
				validateUsageError(/same SchemaFactory generated class/),
			);
		});
	});

	it("kind based narrowing", () => {
		const factory = new SchemaFactory("");

		class Obj extends factory.object("O", {}) {}
		class Arr extends factory.array("A", []) {}
		class MapNode extends factory.map("M", []) {}

		const obj = hydrate(Obj, {});
		const arr = hydrate(Arr, []);
		const mapNode = hydrate(MapNode, {});

		function f(node: TreeNode & WithType<string, NodeKind.Object>): "object";
		function f(node: TreeNode & WithType<string, NodeKind.Array>): "array";
		function f(node: TreeNode & WithType<string, NodeKind.Map>): "map";
		function f(node: TreeNode): "any";

		function f(node: TreeNode): string {
			return "nope";
		}

		// Compile time check that NodeKind based overload resolution works as expected.
		const s1: "object" = f(obj);
		const s2: "array" = f(arr);
		const s3: "map" = f(mapNode);
		const s4: "any" = f(obj as TreeNode);

		// Check runtime data:
		assert.equal(obj[typeSchemaSymbol], Obj);
		assert.equal(arr[typeSchemaSymbol], Arr);
		assert.equal(mapNode[typeSchemaSymbol], MapNode);
	});

	it("kind based narrowing example", () => {
		const factory = new SchemaFactory("");

		class Obj extends factory.object("O", { a: factory.number }) {}
		class Arr extends factory.array("A", [factory.number]) {}
		class MapNode extends factory.map("M", [factory.number]) {}

		const obj = hydrate(Obj, { a: 5 });
		const arr = hydrate(Arr, [5]);
		const mapNode = hydrate(MapNode, { x: 5 });

		assert.deepEqual(getKeys(obj), ["a"]);
		assert.deepEqual(getKeys(arr), [0]);
		assert.deepEqual(getKeys(mapNode), ["x"]);
	});

	it("withMetadata", () => {
		const factory = new SchemaFactory("");

		const fooMetadata = {
			description: "An array of numbers",
			custom: {
				baz: true,
			},
		};

		class Foo extends withMetadata(factory.array("Foo", factory.number), fooMetadata) {}

		assert.deepEqual(Foo.metadata, fooMetadata);

		// Ensure the typing is as we expect
		const description = Foo.metadata.description;
		const baz = Foo.metadata.custom.baz;
	});
});

// kind based narrowing example
function getKeys(node: TreeNode & WithType<string, NodeKind.Array>): number[];
function getKeys(node: TreeNode & WithType<string, NodeKind.Map | NodeKind.Object>): string[];
function getKeys(node: TreeNode): string[] | number[];
function getKeys(node: TreeNode): string[] | number[] {
	const schema = Tree.schema(node);
	switch (schema.kind) {
		case NodeKind.Array: {
			const arrayNode = node as TreeArrayNode;
			const keys: number[] = [];
			for (let index = 0; index < arrayNode.length; index++) {
				keys.push(index);
			}
			return keys;
		}
		case NodeKind.Map:
			return [...(node as TreeMapNode).keys()];
		case NodeKind.Object:
			return Object.keys(node);
		default:
			throw new Error("Unsupported Kind");
	}
}

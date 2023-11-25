/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { Tree, TreeConfiguration, TreeView } from "../../class-tree";
import {
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
	class NodeList extends schema.list("Notes", Note) {}

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

	it("object", () => {
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

	it("object custom members", () => {
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

	// Skipped since constructing map and list nodes directly is not yet implemented
	it.skip("mixed", () => {
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
		class NodeList extends schema.list("NoteList", Note) {}

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
		const item = stuff[1];
		const s: string = item.text;
		assert.equal(s, "hi");
	});

	describe("List", () => {
		it("Nested List", () => {
			const builder = new SchemaFactory("test");

			class Inventory extends builder.object("Inventory", {
				parts: builder.list(builder.number),
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
			const MyList = factory.list(factory.number);
			type MyList = NodeFromSchema<typeof MyList>;

			// Inline structural example
			factory.object("Foo", { myList: factory.list(factory.number) });

			function broken() {
				// @ts-expect-error structural list schema are not typed as classes.
				class NotAClass extends factory.list(factory.number) {}
			}
		});

		it("Named", () => {
			const factory = new SchemaFactory("test");
			class NamedList extends factory.list("name", factory.number) {
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

		// Unhydrated lists are not implemented yet
		it.skip("Unhydrated", () => {
			const factory = new SchemaFactory("test");
			class NamedList extends factory.list("name", factory.number) {}
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

		// Unhydrated maps are not implemented yet
		it.skip("Unhydrated", () => {
			const factory = new SchemaFactory("test");
			class NamedMap extends factory.map("name", factory.number) {}
			const namedInstance = new NamedMap(new Map([["x", 5]]));
		});
	});
});

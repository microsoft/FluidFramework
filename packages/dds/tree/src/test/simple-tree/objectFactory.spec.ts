/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { extractFactoryContent } from "../../simple-tree/proxies.js";
import {
	SchemaFactory,
	Tree,
	InsertableTreeFieldFromImplicitField,
} from "../../simple-tree/index.js";

// eslint-disable-next-line import/no-internal-modules
import { getFlexNode } from "../../simple-tree/flexNode.js";
import { getRoot } from "./utils.js";

describe("SharedTreeObject factories", () => {
	const sb = new SchemaFactory("test");

	class ChildA extends sb.object("childA", {
		content: sb.number,
	}) {}

	class ChildB extends sb.object("childB", {
		content: sb.number,
	}) {}

	class ChildOptional extends sb.object("childOptional", {
		content: sb.optional(sb.number),
	}) {}

	class ChildD extends sb.object("childD", {
		list: sb.array([ChildA, ChildB]),
		map: sb.map([ChildA, ChildB]),
	}) {}

	class ChildC extends sb.object("childC", {
		child: ChildD,
	}) {}

	class Schema extends sb.object("parent", {
		child: ChildA,
		poly: [ChildA, ChildB],
		list: sb.array(sb.number),
		map: sb.map(sb.number),
		optional: sb.optional(ChildOptional),
		grand: ChildC,
	}) {}

	const initialTree: () => InsertableTreeFieldFromImplicitField<typeof Schema> = () => ({
		child: new ChildA({ content: 42 }),
		poly: new ChildB({ content: 42 }),
		list: [42, 42, 42],
		map: new Map([
			["a", 0],
			["b", 1],
		]),
		// TODO: Omit optional field once correctly supported.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6569
		optional: undefined,
		grand: {
			child: {
				list: [new ChildA({ content: 42 }), new ChildB({ content: 42 })],
				map: new Map<string, ChildA | ChildB>([
					["a", new ChildA({ content: 42 })],
					["b", new ChildB({ content: 42 })],
				]),
			},
		},
	});

	it("correctly construct objects with content", () => {
		const root = getRoot(Schema, initialTree);
		root.child = new ChildA({ content: 43 });
		assert.equal(root.child.content, 43);
	});

	it("construct objects that work in polymorphic fields", () => {
		const root = getRoot(Schema, initialTree);
		root.poly = new ChildA({ content: 43 });
		assert.equal(root.poly.content, 43);
		root.poly = new ChildB({ content: 44 });
		assert.equal(root.poly.content, 44);
	});

	it("can re-use content objects", () => {
		const root = getRoot(Schema, initialTree);
		// The `create` functions stamp the content with a `[typeNameSymbol]`.
		// This test ensures that they shallow copy the content before doing the stamp.
		const content = { content: 43 };
		root.poly = new ChildA(content);
		content.content = 44;
		root.poly = new ChildB(content);
		assert.equal(root.poly.content, 44);
	});

	// TODO: Fix prototype for objects declared using 'class-schema'.
	// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
	it.skip("don't require optional data to be included", () => {
		const root = getRoot(Schema, initialTree);
		assert.equal(root.optional, undefined);
		root.optional = new ChildOptional({ content: undefined });
		assert.deepEqual(root.optional, {});
		assert.equal(root.optional.content, undefined);
	});

	// TODO: Fix prototype for objects declared using 'class-schema'.
	// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
	it.skip("support nesting inside of a factory", () => {
		const root = getRoot(Schema, initialTree);
		root.grand = new ChildC({
			child: new ChildD({
				list: [new ChildA({ content: 43 }), new ChildB({ content: 43 })],
				map: new Map<string, ChildA | ChildB>([
					["a", new ChildA({ content: 43 })],
					["b", new ChildB({ content: 43 })],
				]),
			}),
		});
		assert.deepEqual(root.grand.child.list, [{ content: 43 }, { content: 43 }]);
		assert.deepEqual(root.grand.child.map.get("a"), { content: 43 });
		assert.deepEqual(root.grand.child.map.get("b"), { content: 43 });
	});

	// TODO: Fix prototype for objects declared using 'class-schema'.
	// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
	it.skip("support nesting inside of a plain javascript object", () => {
		const root = getRoot(Schema, initialTree);
		root.grand = new ChildC({
			child: new ChildD({
				list: [new ChildA({ content: 43 }), new ChildB({ content: 43 })],
				map: new Map<string, ChildA | ChildB>([
					["a", new ChildA({ content: 43 })],
					["b", new ChildB({ content: 43 })],
				]),
			}),
		});
		assert.deepEqual(root.grand.child.list, [{ content: 43 }, { content: 43 }]);
		assert.deepEqual(root.grand.child.map.get("a"), { content: 43 });
		assert.deepEqual(root.grand.child.map.get("b"), { content: 43 });
	});

	describe("factory content extraction", () => {
		it("extracts a primitive", () => {
			assert.equal(extractFactoryContent(42).content, 42);
		});
		it("extracts an object", () => {
			assert.deepEqual(extractFactoryContent(new ChildA({ content: 42 })).content, {
				content: 42,
			});
		});
		it("extracts an array of primitives", () => {
			assert.deepEqual(extractFactoryContent([42, 42]).content, [42, 42]);
		});
		it("extracts an array of objects", () => {
			assert.deepEqual(
				extractFactoryContent([new ChildA({ content: 42 }), new ChildA({ content: 42 })])
					.content,
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
				extractFactoryContent(new Map([["a", new ChildA({ content: 42 })]])).content,
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
					new ChildC({
						child: new ChildD({
							list: [new ChildA({ content: 42 })],
							map: new Map([["a", new ChildA({ content: 42 })]]),
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
		const root = getRoot(Schema, initialTree);
		function readData() {
			const objectContent = root.child.content;
			assert(objectContent !== undefined);
			const listContent = root.grand.child.list[root.grand.child.list.length - 1];
			assert(listContent !== undefined);
			const mapContent = root.grand.child.map.get("a");
			assert(mapContent !== undefined);
		}
		getFlexNode(root).on("beforeChange", () => {
			readData();
		});
		Tree.on(root, "afterChange", () => {
			readData();
		});

		const content = { content: 3 };
		root.child = new ChildA(content);
		root.grand.child.list.insertAtEnd(new ChildA(content));
		readData();
		root.grand.child.map.set("a", new ChildA(content));
		readData();
	});

	it("hydration is not attempted on objects which are not proxies", () => {
		// This regression test ensures that non-proxy objects inserted into the tree are
		// not mistakenly "hydrated" as a proxy would be, falsely linking them to the content of the tree.
		const root = getRoot(Schema, initialTree);
		const newChild = { content: 43 };
		// `newChild` is not a proxy, so it should be copied into the tree here but otherwise remain disconnected
		root.child = new ChildA(newChild);
		const child = root.child;
		assert.equal(child.content, 43);
		// Mutating the tree should have no effect on `newChild`...
		root.child.content = 44;
		assert.equal(newChild.content, 43);
		// ... but it should affect our handle to the child
		assert.equal(child.content, 44);
		// Mutating `newChild` should have no effect on the tree...
		newChild.content = 45;
		assert.equal(root.child.content, 44);
		// ... and should have no effect on our handle to the child
		assert.equal(child.content, 44);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../domains";
import { typeNameSymbol } from "../../feature-libraries";
import { Tree as SimpleTree } from "../../simple-tree";
// eslint-disable-next-line import/no-internal-modules
import { extractFactoryContent } from "../../simple-tree/proxies";
import { getOldRoot } from "./utils";

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

	it("correctly construct objects with content", () => {
		const root = getOldRoot(schema, initialTree);
		root.child = childA.create({ content: 43 });
		assert.equal(root.child.content, 43);
	});

	it("construct objects that work in polymorphic fields", () => {
		const root = getOldRoot(schema, initialTree);
		root.poly = childA.create({ content: 43 });
		assert.equal(root.poly.content, 43);
		root.poly = childB.create({ content: 44 });
		assert.equal(root.poly.content, 44);
	});

	it("can re-use content objects", () => {
		const root = getOldRoot(schema, initialTree);
		// The `create` functions stamp the content with a `[typeNameSymbol]`.
		// This test ensures that they shallow copy the content before doing the stamp.
		const content = { content: 43 };
		root.poly = childA.create(content);
		content.content = 44;
		root.poly = childB.create(content);
		assert.equal(root.poly.content, 44);
	});

	it("don't require optional data to be included", () => {
		const root = getOldRoot(schema, initialTree);
		assert.equal(root.optional, undefined);
		root.optional = {};
		assert.deepEqual(root.optional, {});
		assert.equal(root.optional.content, undefined);
	});

	it("support nesting inside of a factory", () => {
		const root = getOldRoot(schema, initialTree);
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

	it("support nesting inside of a plain javascript object", () => {
		const root = getOldRoot(schema, initialTree);
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
	});

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
		const root = getOldRoot(schema, initialTree);
		function readData() {
			const objectContent = root.child.content;
			assert(objectContent !== undefined);
			const listContent = root.grand.child.list[root.grand.child.list.length - 1];
			assert(listContent !== undefined);
			const mapContent = root.grand.child.map.get("a");
			assert(mapContent !== undefined);
		}
		SimpleTree.on(root, "beforeChange", () => {
			readData();
		});
		SimpleTree.on(root, "afterChange", () => {
			readData();
		});

		const content = { content: 3 };
		root.child = childA.create(content);
		root.grand.child.list.insertAtEnd(childA.create(content));
		readData();
		root.grand.child.map.set("a", childA.create(content));
		readData();
	});

	it("hydration is not attempted on objects which are not proxies", () => {
		// This regression test ensures that non-proxy objects inserted into the tree are
		// not mistakenly "hydrated" as a proxy would be, falsely linking them to the content of the tree.
		const root = getOldRoot(schema, initialTree);
		const newChild = { content: 43 };
		// `newChild` is not a proxy, so it should be copied into the tree here but otherwise remain disconnected
		root.child = newChild;
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

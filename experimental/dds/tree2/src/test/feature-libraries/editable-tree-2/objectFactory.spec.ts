/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../domains";
import { typeNameSymbol } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { extractFactoryContent } from "../../../feature-libraries/editable-tree-2/proxies/proxies";
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
			assert.equal(extractFactoryContent(42), 42);
		});
		it("extracts an object", () => {
			assert.deepEqual(extractFactoryContent(childA.create({ content: 42 })), {
				content: 42,
			});
		});
		it("extracts an array of primitives", () => {
			assert.deepEqual(extractFactoryContent([42, 42]), [42, 42]);
		});
		it("extracts an array of objects", () => {
			assert.deepEqual(
				extractFactoryContent([
					childA.create({ content: 42 }),
					childA.create({ content: 42 }),
				]),
				[{ content: 42 }, { content: 42 }],
			);
		});
		it("extracts an array of maps", () => {
			assert.deepEqual(extractFactoryContent([new Map([["a", 42]])]), [new Map([["a", 42]])]);
		});
		it("extracts a map of primitives", () => {
			assert.deepEqual(extractFactoryContent(new Map([["a", 42]])), new Map([["a", 42]]));
		});
		it("extracts a map of objects", () => {
			assert.deepEqual(
				extractFactoryContent(new Map([["a", childA.create({ content: 42 })]])),
				new Map([["a", { content: 42 }]]),
			);
		});
		it("extracts a map of arrays", () => {
			assert.deepEqual(extractFactoryContent(new Map([["a", [42]]])), new Map([["a", [42]]]));
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
				),
				{
					child: { list: [{ content: 42 }], map: new Map([["a", { content: 42 }]]) },
				},
			);
		});
	});
});

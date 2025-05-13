/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type InsertableTreeFieldFromImplicitField,
	type NodeFromSchema,
	SchemaFactory,
	treeNodeApi as Tree,
} from "../../simple-tree/index.js";
import { hydrate } from "./utils.js";

describe("SharedTreeObject factories", () => {
	const sb = new SchemaFactory("test");

	const ChildA = sb.object("childA", {
		content: sb.number,
	});

	const ChildB = sb.object("childB", {
		content: sb.number,
	});

	const ChildOptional = sb.object("childOptional", {
		content: sb.optional(sb.number),
	});

	const ChildD = sb.object("childD", {
		list: sb.array([ChildA, ChildB]),
		map: sb.map([ChildA, ChildB]),
	});

	const ChildC = sb.object("childC", {
		child: ChildD,
	});

	const Schema = sb.object("parent", {
		child: ChildA,
		poly: [ChildA, ChildB],
		list: sb.array(sb.number),
		map: sb.map(sb.number),
		optional: sb.optional(ChildOptional),
		grand: ChildC,
	});

	type ChildAOrB = NodeFromSchema<typeof ChildA> | NodeFromSchema<typeof ChildB>;

	function initialTree(): InsertableTreeFieldFromImplicitField<typeof Schema> {
		return {
			child: new ChildA({ content: 42 }),
			poly: new ChildB({ content: 42 }),
			list: [42, 42, 42],
			map: new Map([
				["a", 0],
				["b", 1],
			]),
			grand: {
				child: {
					list: [new ChildA({ content: 42 }), new ChildB({ content: 42 })],
					map: new Map<string, ChildAOrB>([
						["a", new ChildA({ content: 42 })],
						["b", new ChildB({ content: 42 })],
					]),
				},
			},
		};
	}

	it("correctly construct objects with content", () => {
		const root = hydrate(Schema, initialTree());
		root.child = new ChildA({ content: 43 });
		assert.equal(root.child.content, 43);
	});

	it("construct objects that work in polymorphic fields", () => {
		const root = hydrate(Schema, initialTree());
		root.poly = new ChildA({ content: 43 });
		assert.equal(root.poly.content, 43);
		root.poly = new ChildB({ content: 44 });
		assert.equal(root.poly.content, 44);
	});

	it("can re-use content objects", () => {
		const root = hydrate(Schema, initialTree());
		// The `create` functions stamp the content with a `[typeNameSymbol]`.
		// This test ensures that they shallow copy the content before doing the stamp.
		const content = { content: 43 };
		root.poly = new ChildA(content);
		content.content = 44;
		root.poly = new ChildB(content);
		assert.equal(root.poly.content, 44);
	});

	it("don't require optional data to be included", () => {
		const root = hydrate(Schema, initialTree());
		assert.equal(root.optional, undefined);
		root.optional = new ChildOptional({ content: undefined });
		assert.deepEqual(root.optional, {});
		assert.equal(root.optional.content, undefined);
	});

	it.skip("support nesting inside of a factory", () => {
		const root = hydrate(Schema, initialTree());
		root.grand = new ChildC({
			child: new ChildD({
				list: [new ChildA({ content: 43 }), new ChildB({ content: 43 })],
				map: new Map<string, ChildAOrB>([
					["a", new ChildA({ content: 43 })],
					["b", new ChildB({ content: 43 })],
				]),
			}),
		});
		assert.deepEqual(root.grand.child.list, [{ content: 43 }, { content: 43 }]);
		assert.deepEqual(root.grand.child.map.get("a"), { content: 43 });
		assert.deepEqual(root.grand.child.map.get("b"), { content: 43 });
	});

	it.skip("support nesting inside of a plain javascript object", () => {
		const root = hydrate(Schema, initialTree());
		root.grand = new ChildC({
			child: new ChildD({
				list: [new ChildA({ content: 43 }), new ChildB({ content: 43 })],
				map: new Map<string, ChildAOrB>([
					["a", new ChildA({ content: 43 })],
					["b", new ChildB({ content: 43 })],
				]),
			}),
		});
		assert.deepEqual(root.grand.child.list, [{ content: 43 }, { content: 43 }]);
		assert.deepEqual(root.grand.child.map.get("a"), { content: 43 });
		assert.deepEqual(root.grand.child.map.get("b"), { content: 43 });
	});

	it("produce proxies that are hydrated before the tree can be read", () => {
		// This regression test ensures that proxies can be produced by reading the tree during change events.
		// Previously, this was not handled correctly because proxies would not be hydrated until after all change
		// events fired. If a user read the tree during a change event and produced a proxy, that proxy would not
		// be the same as the one that is about to be hydrated for the same underlying edit node, and thus hydration
		// would fail because it tried to map an edit node which already had a proxy to a different proxy.
		const root = hydrate(Schema, initialTree());
		function readData() {
			const objectContent = root.child.content;
			assert(objectContent !== undefined);
			const listContent = root.grand.child.list[root.grand.child.list.length - 1];
			assert(listContent !== undefined);
			const mapContent = root.grand.child.map.get("a");
			assert(mapContent !== undefined);
		}
		Tree.on(root, "treeChanged", () => {
			readData();
		});
		Tree.on(root, "nodeChanged", () => {
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
		const root = hydrate(Schema, initialTree());
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

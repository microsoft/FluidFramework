/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../domains";
import { is, typeNameSymbol } from "../../../feature-libraries";
import { itWithRoot } from "./utils";

describe("SharedTreeObject factories", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const childA = sb.struct("childA", {
		content: sb.number,
	});

	const childB = sb.struct("childB", {
		content: sb.number,
	});

	const parent = sb.struct("parent", {
		child: [childA],
		poly: [childA, childB],
		list: sb.fieldNode("list", sb.sequence(sb.number)),
	});

	const schema = sb.toDocumentSchema(parent);

	const initialTree = {
		// TODO:#5928: Remove need for typeNameSymbol by calling factory function instead
		child: { [typeNameSymbol]: "test.childA", content: 42 },
		poly: { [typeNameSymbol]: "test.childB", content: 42 },
		list: [42, 42, 42],
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
});

describe("SharedTree proxies", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const childSchema = sb.struct("struct", {
		content: sb.number,
	});

	const parentSchema = sb.struct("parent", {
		struct: childSchema,
		list: sb.fieldNode("list", sb.sequence(sb.number)),
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		struct: { content: 42 },
		list: [42, 42, 42],
	};

	itWithRoot("cache and reuse structs", schema, initialTree, (root) => {
		const structProxy = root.struct;
		const structProxyAgain = root.struct;
		assert.equal(structProxyAgain, structProxy);
	});

	itWithRoot("cache and reuse lists", schema, initialTree, (root) => {
		const listProxy = root.list;
		const listProxyAgain = root.list;
		assert.equal(listProxyAgain, listProxy);
	});

	// TODO: Test map proxy re-use when maps are implemented
});

describe("SharedTreeObject", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const numberChild = sb.struct("numberChild", {
		content: sb.number,
	});

	const stringChild = sb.struct("stringChild", {
		content: sb.string,
	});

	const parentSchema = sb.struct("parent", {
		content: sb.number,
		child: numberChild,
		polyValue: [sb.number, sb.string],
		polyChild: [numberChild, stringChild],
		polyValueChild: [sb.number, numberChild],
		// map: sb.map("map", sb.optional(leaf.string)), // TODO Test Maps
		list: sb.fieldNode("list", sb.sequence(numberChild)),
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		content: 42,
		child: { content: 42 },
		polyValue: "42",
		polyChild: { content: "42", [typeNameSymbol]: stringChild.name },
		polyValueChild: { content: 42 },
		list: [{ content: 42 }, { content: 42 }],
	};

	itWithRoot("can read required fields", schema, initialTree, (root) => {
		assert.equal(root.content, 42);
		assert.equal(root.child.content, 42);
	});

	itWithRoot("can read lists", schema, initialTree, (root) => {
		assert.equal(root.list.length, 2);
		for (const x of root.list) {
			assert.equal(x.content, 42);
		}
	});

	itWithRoot("can read fields common to all polymorphic types", schema, initialTree, (root) => {
		assert.equal(root.polyChild.content, "42");
	});

	itWithRoot("can narrow polymorphic value fields", schema, initialTree, (root) => {
		if (typeof root.polyValue === "number") {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	itWithRoot("can narrow polymorphic struct fields", schema, initialTree, (root) => {
		if (is(root.polyChild, numberChild)) {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	itWithRoot(
		"can narrow polymorphic combinations of value and struct fields",
		schema,
		initialTree,
		(root) => {
			if (is(root.polyValueChild, numberChild)) {
				assert.equal(root.polyValueChild.content, 42);
			} else {
				assert.equal(root.polyValueChild, 42);
			}

			if (typeof root.polyValueChild === "number") {
				assert.equal(root.polyValueChild, 42);
			} else {
				assert.equal(root.polyValueChild.content, 42);
			}
		},
	);
});

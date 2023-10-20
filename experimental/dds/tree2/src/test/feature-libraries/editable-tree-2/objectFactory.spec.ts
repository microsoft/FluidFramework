/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../domains";
import { typeNameSymbol } from "../../../feature-libraries";
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

	const childOptional = sb.struct("childOptional", {
		content: sb.optional(sb.number),
	});

	const parent = sb.struct("parent", {
		child: [childA],
		poly: [childA, childB],
		list: sb.fieldNode("list", sb.sequence(sb.number)),
		optional: sb.optional(childOptional),
	});

	const schema = sb.intoSchema(parent);

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

	itWithRoot("don't require optional data to be included", schema, initialTree, (root) => {
		assert.equal(root.optional, undefined);
		root.optional = {};
		assert.deepEqual(root.optional, {});
		assert.equal(root.optional.content, undefined);
	});
});

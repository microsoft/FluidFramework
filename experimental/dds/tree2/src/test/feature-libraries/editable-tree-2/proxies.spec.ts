/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../domains";
import { node, typeNameSymbol } from "../../../feature-libraries";
import { itWithRoot } from "./utils";

describe("SharedTree proxies", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const childSchema = sb.object("object", {
		content: sb.number,
	});

	const parentSchema = sb.object("parent", {
		struct: childSchema,
		list: sb.fieldNode("list", sb.sequence(sb.number)),
		map: sb.map("map", sb.optional(sb.string)),
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		struct: { content: 42 },
		list: [42, 42, 42],
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
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

	itWithRoot("cache and reuse maps", schema, initialTree, (root) => {
		const mapProxy = root.map;
		const mapProxyAgain = root.map;
		assert.equal(mapProxyAgain, mapProxy);
	});
});

describe("SharedTreeObject", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const numberChild = sb.object("numberChild", {
		content: sb.number,
	});

	const stringChild = sb.object("stringChild", {
		content: sb.string,
	});

	const parentSchema = sb.object("parent", {
		content: sb.number,
		child: numberChild,
		polyValue: [sb.number, sb.string],
		polyChild: [numberChild, stringChild],
		polyValueChild: [sb.number, numberChild],
		map: sb.map("map", sb.optional(sb.string)),
		list: sb.fieldNode("list", sb.sequence(numberChild)),
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		content: 42,
		child: { content: 42 },
		polyValue: "42",
		polyChild: { content: "42", [typeNameSymbol]: stringChild.name },
		polyValueChild: { content: 42 },
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
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

	itWithRoot("can read maps", schema, initialTree, (root) => {
		assert.equal(root.map.size, 2);
		assert.equal(root.map.get("foo"), "Hello");
		assert.equal(root.map.get("bar"), "World");
		assert.equal(root.map.get("baz"), undefined);
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
		if (node.is(root.polyChild, numberChild)) {
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
			if (node.is(root.polyValueChild, numberChild)) {
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

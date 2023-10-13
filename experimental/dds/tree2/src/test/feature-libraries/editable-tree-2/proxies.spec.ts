/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldSchema,
	ProxyField,
	TypedSchemaCollection,
	is,
	typeNameSymbol,
} from "../../../feature-libraries";
import { leaf, SchemaBuilder } from "../../../domains";

import { ISharedTreeView } from "../../../shared-tree";
import { createTreeView } from "./utils";

describe("SharedTree proxies", () => {
	const sb = new SchemaBuilder({
		scope: "test",
		libraries: [leaf.library],
	});

	const childSchema = sb.struct("struct", {
		content: leaf.number,
	});

	const parentSchema = sb.struct("parent", {
		struct: childSchema,
		list: sb.fieldNode("list", sb.sequence(leaf.number)),
	});

	const schema = sb.toDocumentSchema(parentSchema);

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
		libraries: [leaf.library],
	});

	const numberChild = sb.struct("numberChild", {
		content: leaf.number,
	});

	const stringChild = sb.struct("stringChild", {
		content: leaf.string,
	});

	const parentSchema = sb.struct("parent", {
		content: leaf.number,
		child: numberChild,
		polyValue: [leaf.number, leaf.string],
		polyChild: [numberChild, stringChild],
		polyValueChild: [leaf.number, numberChild],
		// map: sb.map("map", sb.optional(leaf.string)), // TODO Test Maps
		list: sb.fieldNode("list", sb.sequence(numberChild)),
	});

	const schema = sb.toDocumentSchema(parentSchema);

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

function itWithRoot<TRoot extends FieldSchema>(
	title: string,
	schema: TypedSchemaCollection<TRoot>,
	initialTree: any,
	fn: (root: ProxyField<(typeof schema)["rootFieldSchema"]>) => void,
): void {
	it(title, () => {
		const view = createTypedTreeView(schema, initialTree);
		const root = view.root2(schema);
		fn(root);
	});
}

function createTypedTreeView<TRoot extends FieldSchema>(
	schema: TypedSchemaCollection<TRoot>,
	initialTree: any,
): ISharedTreeView {
	return createTreeView(schema, initialTree);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldSchema,
	ProxyRoot,
	SchemaBuilder,
	TypedSchemaCollection,
	is,
	typeNameSymbol,
} from "../../../feature-libraries";
import { leaf } from "../../../domains";

import { ISharedTreeView } from "../../../shared-tree";
import { createTreeView } from "./utils";

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
		// map: sb.map("map", sb.optional(leaf.string)),
		list: sb.sequence(numberChild),
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

	function itWithRoot(
		title: string,
		fn: (root: ProxyRoot<typeof schema, "sharedTree">) => void,
	): void {
		it(title, () => {
			const view = createTypedTreeView(schema, initialTree);
			const root = view.root2(schema);
			fn(root);
		});
	}

	itWithRoot("can read required fields", (root) => {
		assert.equal(root.content, 42);
		assert.equal(root.child.content, 42);
	});

	// TODO: Enable when implemented
	// itWithRoot("can read lists", (root) => {
	// 	assert.equal(root.list.length, 2);
	// 	for (const x of root.list) {
	// 		assert.equal(x, 42);
	// 	}
	// });

	itWithRoot("can read fields common to all polymorphic types", (root) => {
		assert.equal(root.polyChild.content, "42");
	});

	itWithRoot("can narrow polymorphic value fields", (root) => {
		if (typeof root.polyValue === "number") {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	itWithRoot("can narrow polymorphic struct fields", (root) => {
		if (is(root.polyChild, numberChild)) {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	itWithRoot("can narrow polymorphic combinations of value and struct fields", (root) => {
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
	});
});

function createTypedTreeView<
	TRoot extends FieldSchema,
	TSchema extends TypedSchemaCollection<TRoot>,
>(
	schema: TSchema,
	initialTree: ProxyRoot<TSchema, "javaScript">,
): ISharedTreeView & {
	root2: (viewSchema: TypedSchemaCollection<TRoot>) => ProxyRoot<TSchema, "sharedTree">;
} {
	return createTreeView(schema, initialTree);
}

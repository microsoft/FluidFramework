/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TreeFieldSchema,
	ImplicitFieldSchema,
	TreeSchema,
	SchemaAware,
} from "../../feature-libraries";
import { TreeField, InsertableTreeRoot } from "../../simple-tree";
import { treeViewWithContent } from "../utils";
import { SchemaBuilder } from "../../domains";

/** Helper for making small test schemas. */

export function makeSchema<const TSchema extends ImplicitFieldSchema>(
	fn: (builder: SchemaBuilder) => TSchema,
) {
	const builder = new SchemaBuilder({
		scope: `test.schema.${Math.random().toString(36).slice(2)}`,
	});
	const root = fn(builder);
	return builder.intoSchema(root);
}

export function setupTest<TRoot extends TreeFieldSchema>(
	schema: TreeSchema<TRoot>,
	initialTree: InsertableTreeRoot<TreeSchema<TRoot>>,
): TreeField<(typeof schema)["rootFieldSchema"]> {
	const view = treeViewWithContent({
		schema,
		initialTree: initialTree as SchemaAware.TypedField<TRoot>,
	});
	return view.root;
}

/**
 * Similar to JSON stringify, but preserves `undefined` and numbers numbers as-is at the root.
 */

export function pretty(arg: unknown): number | undefined | string {
	if (arg === undefined) {
		return "undefined";
	}
	if (typeof arg === "number") {
		return arg;
	}
	if (typeof arg === "string") {
		return `"${arg}"`;
	}
	return JSON.stringify(arg);
}

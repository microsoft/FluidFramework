/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TreeFieldSchema,
	ImplicitFieldSchema,
	ProxyField,
	ProxyRoot,
	TreeSchema,
	SchemaAware,
} from "../../../feature-libraries";
import { treeViewWithContent } from "../../utils";
import { SchemaBuilder } from "../../../domains";

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
/**
 * @deprecated Write a normal `it` test. Doing so allows:
 * 1. Selecting between viewWithContent and {@link readonlyTreeWithContent} or some other setup.
 * 2. Navigate to test source and similar tools and IDE integration to work.
 * 3. Use of `it.only` and `it.skip`.
 * 4. Easier understanding of what is a test for new people looking at the test files.
 * 5. Consistent test patterns for users of APIs other than context.root.
 * 6. Ability to write async tests.
 */

export function itWithRoot<TRoot extends TreeFieldSchema>(
	title: string,
	schema: TreeSchema<TRoot>,
	initialTree: ProxyRoot<TreeSchema<TRoot>, "javaScript">,
	fn: (root: ProxyField<(typeof schema)["rootFieldSchema"]>) => void,
): void {
	it(title, () => {
		const view = treeViewWithContent({
			schema,
			initialTree: initialTree as SchemaAware.TypedField<TRoot, SchemaAware.ApiMode.Flexible>,
		});
		const root = view.root;
		fn(root);
	});
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

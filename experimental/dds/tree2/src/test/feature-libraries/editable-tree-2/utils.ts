/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	DefaultEditBuilder,
	TreeFieldSchema,
	ImplicitFieldSchema,
	ProxyField,
	ProxyRoot,
	TreeSchema,
	createMockNodeKeyManager,
	nodeKeyFieldKey,
	SchemaAware,
	AllowedTypes,
	FieldKind,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context, getTreeContext } from "../../../feature-libraries/editable-tree-2/context";
import {
	FieldAnchor,
	IEditableForest,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core";
import { TreeContent } from "../../../shared-tree";
import { forestWithContent, viewWithContent } from "../../utils";
import { brand } from "../../../util";
import { SchemaBuilder } from "../../../domains";

export function getReadonlyContext(forest: IEditableForest, schema: TreeSchema): Context {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return getTreeContext(
		schema,
		forest,
		dummyEditor,
		createMockNodeKeyManager(),
		brand(nodeKeyFieldKey),
	);
}

/**
 * Creates a context and its backing forest from the provided `content`.
 *
 * For creating mutable views use {@link viewWithContent}, but prefer this when possible as it has fewer dependencies and simpler setup.
 *
 * @returns The created context.
 */
export function contextWithContentReadonly(content: TreeContent): Context {
	const forest = forestWithContent(content);
	return getReadonlyContext(forest, content.schema);
}

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
export function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.forest.allocateCursor();
	assert.equal(context.forest.tryMoveCursorToField(anchor, cursor), TreeNavigationResult.Ok);
	return cursor;
}

export const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Initializes a readonly test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
export function readonlyTreeWithContent<Kind extends FieldKind, Types extends AllowedTypes>(
	treeContent: TreeContent,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const context = contextWithContentReadonly(treeContent);
	const cursor = initializeCursor(context, rootFieldAnchor);

	return {
		context,
		cursor,
	};
}

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
		const view = viewWithContent({
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

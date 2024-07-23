/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type FieldAnchor,
	type IEditableForest,
	type ITreeSubscriptionCursor,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { type Context, getTreeContext } from "../../../feature-libraries/flex-tree/context.js";
import {
	type FlexAllowedTypes,
	type FlexFieldKind,
	type FlexTreeSchema,
	MockNodeKeyManager,
} from "../../../feature-libraries/index.js";
import type { TreeContent } from "../../../shared-tree/index.js";
import { MockTreeCheckout, forestWithContent } from "../../utils.js";

export function getReadonlyContext(forest: IEditableForest, schema: FlexTreeSchema): Context {
	return getTreeContext(schema, new MockTreeCheckout(forest), new MockNodeKeyManager());
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
export function initializeCursor(
	context: Context,
	anchor: FieldAnchor,
): ITreeSubscriptionCursor {
	const cursor = context.checkout.forest.allocateCursor();
	assert.equal(
		context.checkout.forest.tryMoveCursorToField(anchor, cursor),
		TreeNavigationResult.Ok,
	);
	return cursor;
}

export const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Initializes a readonly test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
export function readonlyTreeWithContent<
	Kind extends FlexFieldKind,
	Types extends FlexAllowedTypes,
>(
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

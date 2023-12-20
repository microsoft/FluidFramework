/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	DefaultEditBuilder,
	FlexTreeSchema,
	createMockNodeKeyManager,
	nodeKeyFieldKey,
	AllowedTypes,
	FieldKind,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context, getTreeContext } from "../../../feature-libraries/flex-tree/context";
import {
	FieldAnchor,
	IEditableForest,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core";
import { TreeContent } from "../../../shared-tree";
import { forestWithContent } from "../../utils";
import { brand } from "../../../util";

export function getReadonlyContext(forest: IEditableForest, schema: FlexTreeSchema): Context {
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

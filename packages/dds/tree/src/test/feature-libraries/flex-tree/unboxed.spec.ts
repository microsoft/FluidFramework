/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import {
	type FieldAnchor,
	type ITreeSubscriptionCursor,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core/index.js";
import type { Context } from "../../../feature-libraries/flex-tree/context.js";
import { unboxedFlexNode } from "../../../feature-libraries/flex-tree/unboxed.js";
import {
	isFlexTreeNode,
	type FlexAllowedTypes,
	type FlexFieldKind,
} from "../../../feature-libraries/index.js";
import type { TreeContent } from "../../../shared-tree/index.js";

import { contextWithContentReadonly } from "./utils.js";
import { toFlexSchema } from "../../../simple-tree/index.js";
import { stringSchema } from "../../../simple-tree/leafNodeSchema.js";
import { JsonUnion, singleJsonCursor } from "../../json/index.js";

const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.checkout.forest.allocateCursor();

	assert.equal(
		context.checkout.forest.tryMoveCursorToField(anchor, cursor),
		TreeNavigationResult.Ok,
	);
	return cursor;
}

/**
 * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FlexFieldKind, Types extends FlexAllowedTypes>(
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

describe("unboxedFlexNode", () => {
	it("Leaf", () => {
		const schema = toFlexSchema(stringSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor("Hello world"),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedFlexNode(context, cursor), "Hello world");
	});

	it("Non-Leaf", () => {
		const schema = toFlexSchema(JsonUnion);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor({}),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert(isFlexTreeNode(unboxedFlexNode(context, cursor)));
	});
});

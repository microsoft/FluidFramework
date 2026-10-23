/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeFieldStoredSchema } from "../../core/index.js";
import {
	defaultSchemaPolicy,
	FieldKinds,
	isTreeValue,
} from "../../feature-libraries/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { brand } from "../../util/index.js";
import {
	Context,
	getKernel,
	isTreeNode,
	UnhydratedContext,
	type Unhydrated,
	type TreeNode,
	type TreeLeafValue,
} from "../core/index.js";
import { getUnhydratedContext } from "../createContext.js";
import type { ImplicitFieldSchema, TreeFieldFromImplicitField } from "../fieldSchema.js";

import { createFromCursor } from "./create.js";

/**
 * Narrows a generic field read to a tree node, leaf value, or `undefined`.
 * @param content - The value to check before passing it to a content-only operation.
 * @throws A usage error for live field accessors or other values that are not tree content.
 * @remarks
 * This distinguishes content from field APIs; it does not validate content against a destination schema.
 */
export function assertTreeContent<T>(
	content: T,
): asserts content is T & (TreeNode | TreeLeafValue | undefined) {
	if (content !== undefined && !isTreeNode(content) && !isTreeValue(content)) {
		throw new UsageError("This operation requires raw tree content, not a field accessor");
	}
}

/**
 * Copies a node's persisted subtree into an unhydrated node; leaf values and `undefined` are returned unchanged.
 * @param node - Raw tree content, not a live field accessor.
 * @returns An independent unhydrated copy for nodes, or the original value for non-nodes.
 * @throws A usage error if an untyped caller supplies a field accessor or other non-content value.
 */
export function cloneTree<T extends TreeNode | TreeLeafValue | undefined>(
	node: T,
): Unhydrated<T>;
/**
 * {@inheritDoc (cloneTree:1)}
 */
export function cloneTree<const TSchema extends ImplicitFieldSchema>(
	node: TreeFieldFromImplicitField<TSchema> & (TreeNode | TreeLeafValue | undefined),
): Unhydrated<TreeFieldFromImplicitField<TSchema> & (TreeNode | TreeLeafValue | undefined)>;
export function cloneTree(
	node: TreeNode | TreeLeafValue | undefined,
): Unhydrated<TreeNode | TreeLeafValue | undefined> {
	if (!isTreeNode(node)) {
		assertTreeContent(node);
		return node;
	}

	const kernel = getKernel(node);
	const cursor = kernel.getInnerNode().borrowCursor();
	const flexContext = new UnhydratedContext(
		defaultSchemaPolicy,
		kernel.context.flexContext.schema,
	);
	const context = new Context(flexContext, getUnhydratedContext(kernel.schema).schema);

	const fieldSchema: TreeFieldStoredSchema = {
		kind: FieldKinds.required.identifier,
		types: new Set([brand(kernel.schema.identifier)]),
		persistedMetadata: undefined,
	};
	return createFromCursor(kernel.schema, cursor, fieldSchema, context);
}

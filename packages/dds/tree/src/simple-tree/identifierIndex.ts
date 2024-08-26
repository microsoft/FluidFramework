/* eslint-disable @typescript-eslint/no-unsafe-return */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AnchorNode, FieldKey, TreeValue } from "../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeTree } from "../feature-libraries/flex-tree/lazyNode.js";
import {
	Context,
	AnchorTreeIndex,
	flexTreeSlot,
	type FlexTreeNode,
	FlexObjectNodeSchema,
	FieldKinds,
	type FlexTreeContext,
	type KeyFinder,
	isTreeValue,
	type TreeIndexNodes,
	hasElement,
	type TreeIndex,
} from "../feature-libraries/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { brand, fail } from "../util/index.js";
import { assert } from "@fluidframework/core-utils/internal";
import type { NodeFromSchema } from "./schemaTypes.js";
import { isObjectNodeSchema, type ObjectNodeSchema } from "./objectNodeTypes.js";
import type { TreeNode, TreeNodeSchema } from "./index.js";
import { getSimpleNodeSchema } from "./core/index.js";
import { getOrCreateNodeFromFlexTreeNode } from "./proxies.js";
import { tryGetCachedHydratedTreeNode } from "./proxyBinding.js";

/**
 * A {@link TreeIndex} that returns tree nodes given their associated keys.
 */
type SimpleTreeIndex<TKey extends TreeValue, TSchema extends TreeNodeSchema> =
	| TreeIndex<TKey, TreeNode>
	| TreeIndex<TKey, NodeFromSchema<TSchema>>;

/**
 * Creates a {@link SimpleTreeIndex} with a specified indexer.
 *
 * NOTE: use Tree.is for downcasting
 *
 * @param context -
 * @param indexer -
 * @param getValue -
 * @param indexableSchema -
 */
export function createSimpleTreeIndex<TKey extends TreeValue, TValue>(
	context: FlexTreeContext,
	indexer: (schema: TreeNodeSchema) => KeyFinder<TKey> | undefined,
	getValue: (nodes: TreeIndexNodes<TreeNode>) => TValue,
): SimpleTreeIndex<TKey, TreeNodeSchema>;
export function createSimpleTreeIndex<
	TKey extends TreeValue,
	TValue,
	TSchema extends TreeNodeSchema,
>(
	context: FlexTreeContext,
	indexer: (schema: TSchema) => KeyFinder<TKey> | undefined,
	getValue: (nodes: TreeIndexNodes<NodeFromSchema<TSchema>>) => TValue,
	indexableSchema: readonly TSchema[],
): SimpleTreeIndex<TKey, TSchema>;
export function createSimpleTreeIndex<TKey extends TreeValue, TValue>(
	context: FlexTreeContext,
	indexer: (schema: TreeNodeSchema) => KeyFinder<TKey> | undefined,
	getValue:
		| ((nodes: TreeIndexNodes<NodeFromSchema<ObjectNodeSchema>>) => TValue)
		| ((nodes: TreeIndexNodes<NodeFromSchema<TreeNodeSchema>>) => TValue),
	indexableSchema?: readonly TreeNodeSchema[],
	// todo fix this
): SimpleTreeIndex<TKey, TreeNodeSchema> {
	assert(context instanceof Context, "Unexpected context implementation");
	const index = new AnchorTreeIndex<TKey, TValue>(
		context.checkout.forest,
		(schemaIdentifier) => {
			if (indexableSchema !== undefined) {
				// todo: fix this lookup
				for (const schemus of indexableSchema) {
					if (schemus.identifier === schemaIdentifier) {
						return indexer(schemus);
					}
				}
			} else {
				const flexSchema = context.schema.nodeSchema.get(schemaIdentifier);
				if (flexSchema !== undefined) {
					const schemus = getSimpleNodeSchema(flexSchema);
					// if (isObjectNodeSchema(schemus)) {
					return indexer(schemus);
					// }
				} else {
					// else: the node is out of schema. TODO: do we error, or allow that?
					fail("node is out of schema");
				}
			}
		},
		(anchorNodes) => {
			const simpleTreeNodes: TreeNode[] = [];
			for (const a of anchorNodes) {
				const simpleTree = getOrCreateSimpleTree(context, a);
				if (!isTreeValue(simpleTree)) {
					simpleTreeNodes.push(simpleTree);
				}
			}

			if (hasElement(simpleTreeNodes)) {
				return getValue(simpleTreeNodes);
			}
		},
	);
	// all the type checking guarantees that we put nodes of the correct type in the index
	// but it's not captured in the type system
	return index as SimpleTreeIndex<TKey, TSchema>;
}

/**
 * An index that returns tree nodes given their associated identifiers.
 */
type IdentifierIndex = SimpleTreeIndex<string, TreeNodeSchema>;

/**
 * Creates an {@link IdentifierIndex} for a given {@link FlexTreeContext}.
 */
export function createIdentifierIndex(context: FlexTreeContext): IdentifierIndex {
	assert(context instanceof Context, "Unexpected context implementation");

	// For each node schema, find which field key the identifier field is under.
	// This can be done easily because identifiers are their own field kinds.
	const identifierFields = new Map<string, FieldKey>();
	for (const [schemaId, schemus] of context.schema.nodeSchema.entries()) {
		if (schemus instanceof FlexObjectNodeSchema) {
			for (const [fieldKey, fieldSchema] of schemus.objectNodeFields.entries()) {
				if (fieldSchema.kind.identifier === FieldKinds.identifier.identifier) {
					identifierFields.set(schemaId, brand(fieldKey));
					break;
				}
			}
		}
	}

	return createSimpleTreeIndex(
		context,
		(schema) => {
			const identifierFieldKey = identifierFields.get(schema.identifier);
			if (identifierFieldKey !== undefined) {
				return (cursor) => {
					cursor.enterField(identifierFieldKey);
					cursor.enterNode(0);
					const identifier = cursor.value as string;
					cursor.exitNode();
					cursor.exitField();
					return identifier;
				};
			}
		},
		(nodes) => {
			if (nodes.length > 1) {
				throw new UsageError(
					"Cannot retrieve node from index: there are multiple nodes with the same identifier",
				);
			}
		},
	);
}

/**
 * Gets a simple tree from an anchor node
 */
function getOrCreateSimpleTree(
	context: Context,
	anchorNode: AnchorNode,
): TreeNode | TreeValue {
	return (
		tryGetCachedHydratedTreeNode(anchorNode) ??
		getOrCreateNodeFromFlexTreeNode(
			anchorNode.slots.get(flexTreeSlot) ?? makeFlexNode(context, anchorNode),
		)
	);
}

/**
 * Make a flex tree node from an anchor node
 */
function makeFlexNode(context: Context, anchorNode: AnchorNode): FlexTreeNode {
	const cursor = context.checkout.forest.allocateCursor();
	context.checkout.forest.moveCursorToPath(anchorNode, cursor);
	const flexNode = makeTree(context, cursor);
	cursor.free();
	return flexNode;
}

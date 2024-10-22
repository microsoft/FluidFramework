/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { AnchorNode, FieldKey, TreeNodeSchemaIdentifier } from "../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeTree } from "../../feature-libraries/flex-tree/lazyNode.js";
import {
	Context,
	AnchorTreeIndex,
	flexTreeSlot,
	type FlexTreeNode,
	type KeyFinder,
	isTreeValue,
	type TreeIndexNodes,
	hasElement,
	type TreeIndex,
	type FlexTreeContext,
	type TreeIndexKey,
} from "../../feature-libraries/index.js";
import { brand, fail } from "../../util/index.js";
import { FieldKind, type NodeFromSchema } from "../schemaTypes.js";
import { getSimpleNodeSchema, type TreeNode, type TreeNodeSchema } from "../core/index.js";
import { getOrCreateNodeFromFlexTreeNode } from "../proxies.js";
import { ObjectNodeSchema } from "../objectNodeTypes.js";
import { treeNodeApi } from "./treeNodeApi.js";

/**
 * A {@link TreeIndex} that returns tree nodes given their associated keys.
 *
 * @alpha
 */
export type SimpleTreeIndex<TKey extends TreeIndexKey, TValue> = TreeIndex<TKey, TValue>;

/**
 * Creates a {@link SimpleTreeIndex} with a specified indexer.
 *
 * @param context - the context for the tree being indexed
 * @param indexer - a function that takes in a {@link TreeNodeSchema} and returns a {@link KeyFinder} that works with the schema
 * @param getValue - given at least one {@link TreeNode}, returns an associated value
 *
 * @alpha
 */
export function createSimpleTreeIndex<TKey extends TreeIndexKey, TValue>(
	context: FlexTreeContext,
	indexer: (schema: TreeNodeSchema) => KeyFinder<TKey> | undefined,
	getValue: (nodes: TreeIndexNodes<TreeNode>) => TValue,
): SimpleTreeIndex<TKey, TValue>;
/**
 * Creates a {@link SimpleTreeIndex} with a specified indexer.
 *
 * @param context - the context for the tree being indexed
 * @param indexer - a function that takes in a {@link TreeNodeSchema} and returns a {@link KeyFinder} that works with the schema
 * @param getValue - given at least one {@link TreeNode}, returns an associated value
 * @param indexableSchema - a list of all the schema types that can be indexed
 *
 * @alpha
 */
export function createSimpleTreeIndex<
	TKey extends TreeIndexKey,
	TValue,
	TSchema extends TreeNodeSchema,
>(
	context: FlexTreeContext,
	indexer: (schema: TSchema) => KeyFinder<TKey> | undefined,
	getValue: (nodes: TreeIndexNodes<NodeFromSchema<TSchema>>) => TValue,
	indexableSchema: readonly TSchema[],
): SimpleTreeIndex<TKey, TValue>;
/**
 * Creates a {@link SimpleTreeIndex} with a specified indexer.
 *
 * @alpha
 */
export function createSimpleTreeIndex<TKey extends TreeIndexKey, TValue>(
	context: FlexTreeContext,
	indexer: (schema: TreeNodeSchema) => KeyFinder<TKey> | undefined,
	getValue:
		| ((nodes: TreeIndexNodes<TreeNode>) => TValue)
		| ((nodes: TreeIndexNodes<NodeFromSchema<TreeNodeSchema>>) => TValue),
	indexableSchema?: readonly TreeNodeSchema[],
): SimpleTreeIndex<TKey, TValue> {
	assert(context instanceof Context, "unexpected context implementation");
	const indexableSchemaMap = new Map();
	if (indexableSchema !== undefined) {
		for (const schemus of indexableSchema) {
			indexableSchemaMap.set(schemus.identifier, schemus);
		}
	}

	const schemaIndexer =
		indexableSchema === undefined
			? (schemaIdentifier: TreeNodeSchemaIdentifier) => {
					const storedSchema = context.flexSchema.nodeSchema.get(schemaIdentifier);
					if (storedSchema !== undefined) {
						const schemus = getSimpleNodeSchema(storedSchema);
						return indexer(schemus);
					} else {
						// else: the node is out of schema. TODO: do we error, or allow that?
						fail("node is out of schema");
					}
				}
			: (schemaIdentifier: TreeNodeSchemaIdentifier) => {
					const schemus = indexableSchemaMap.get(schemaIdentifier);
					if (schemus !== undefined) {
						return indexer(schemus);
					}
				};

	const index = new AnchorTreeIndex<TKey, TValue>(
		context.checkout.forest,
		schemaIndexer,
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
		(anchorNode: AnchorNode) => {
			const simpleTree = getOrCreateSimpleTree(context, anchorNode);
			if (!isTreeValue(simpleTree)) {
				return treeNodeApi.status(simpleTree);
			}
		},
	);

	// all the type checking guarantees that we put nodes of the correct type in the index
	// but it's not captured in the type system
	return index as SimpleTreeIndex<TKey, TValue>;
}

/**
 * An index that returns tree nodes given their associated identifiers.
 *
 * @alpha
 */
export type IdentifierIndex = SimpleTreeIndex<string, TreeNode>;

/**
 * Creates an {@link IdentifierIndex} for a given {@link FlexTreeContext}.
 *
 * @alpha
 */
export function createIdentifierIndex(context: FlexTreeContext): IdentifierIndex {
	assert(context instanceof Context, "Unexpected context implementation");

	// For each node schema, find which field key the identifier field is under.
	// This can be done easily because identifiers are their own field kinds.
	const identifierFields = new Map<string, FieldKey>();
	for (const [schemaId, flexSchema] of context.flexSchema.nodeSchema.entries()) {
		const schemus = getSimpleNodeSchema(flexSchema);
		if (schemus instanceof ObjectNodeSchema) {
			for (const [fieldKey, fieldSchema] of schemus.fields.entries()) {
				if (fieldSchema.kind === FieldKind.Identifier) {
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
					"cannot retrieve node from index: there are multiple nodes with the same identifier",
				);
			}

			return nodes[0];
		},
	);
}

/**
 * Gets a simple tree from an anchor node
 */
function getOrCreateSimpleTree(
	context: Context,
	anchorNode: AnchorNode,
): TreeNode | TreeIndexKey {
	return getOrCreateNodeFromFlexTreeNode(
		anchorNode.slots.get(flexTreeSlot) ?? makeFlexNode(context, anchorNode),
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

function keyFinder(
	cursor: ITreeSubscriptionCursor,
	keyField: FieldKey,
	index = 0,
): TreeIndexKey {
	cursor.enterField(keyField);
	cursor.enterNode(index);
	const value = cursor.value;
	cursor.exitNode();
	cursor.exitField();

	if (value === undefined) {
		fail("a value for the key does not exist");
	}

	return value;
}

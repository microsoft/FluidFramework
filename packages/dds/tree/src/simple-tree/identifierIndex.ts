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
	TreeStatus,
	FlexObjectNodeSchema,
	FieldKinds,
	type FlexTreeContext,
	type KeyFinder,
	isTreeValue,
	type TreeIndexNodes,
	hasElement,
} from "../feature-libraries/index.js";
import { getOrCreateNodeProxy } from "./proxies.js";
import { tryGetProxy } from "./proxyBinding.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNode } from "./types.js";
import { brand } from "../util/index.js";
import { assert } from "@fluidframework/core-utils/internal";
import type { NodeFromSchema } from "./schemaTypes.js";
import { getSimpleNodeSchema } from "./schemaCaching.js";
import { isObjectNodeSchema, type ObjectNodeSchema } from "./objectNodeTypes.js";

export function createSimpleTreeIndex<TKey extends TreeValue, TValue>(
	context: FlexTreeContext,
	indexer: (schema: ObjectNodeSchema) => KeyFinder<TKey> | undefined,
	getValue: (nodes: TreeIndexNodes<NodeFromSchema<ObjectNodeSchema>>) => TValue,
): AnchorTreeIndex<TKey, NodeFromSchema<ObjectNodeSchema>>;
export function createSimpleTreeIndex<
	TKey extends TreeValue,
	TValue,
	TSchema extends ObjectNodeSchema[] = ObjectNodeSchema[],
>(
	context: FlexTreeContext,
	indexer: (schema: TSchema) => KeyFinder<TKey> | undefined,
	getValue: (nodes: TreeIndexNodes<NodeFromSchema<TSchema[number]>>) => TValue,
	indexableSchema: TSchema,
): AnchorTreeIndex<TKey, NodeFromSchema<TSchema[number]>>;
export function createSimpleTreeIndex<
	TKey extends TreeValue,
	TValue,
	TSchema extends ObjectNodeSchema[] = ObjectNodeSchema[],
>(
	context: FlexTreeContext,
	indexer: (schema: ObjectNodeSchema) => KeyFinder<TKey> | undefined,
	getValue:
		| ((nodes: TreeIndexNodes<NodeFromSchema<ObjectNodeSchema>>) => TValue)
		| ((nodes: TreeIndexNodes<NodeFromSchema<TSchema[number]>>) => TValue),
	indexableSchema?: TSchema,
	// todo fix this
): AnchorTreeIndex<TKey, NodeFromSchema<ObjectNodeSchema>> {
	assert(context instanceof Context, "Unexpected context implementation");
	return new AnchorTreeIndex(
		context.checkout.forest,
		(schemaIdentifier) => {
			if (indexableSchema !== undefined) {
				for (const schemus of indexableSchema) {
					if (schemus.identifier === schemaIdentifier) {
						return indexer(schemus);
					}
				}
			} else {
				const flexSchema = context.schema.nodeSchema.get(schemaIdentifier);
				if (flexSchema !== undefined) {
					const schemus = getSimpleNodeSchema(flexSchema);
					if (isObjectNodeSchema(schemus)) {
						return indexer(schemus);
					}
				} // else: the node is out of schema. TODO: do we error, or allow that?
			}
		},
		(anchorNodes) => {
			const simpleTreeNodes: NodeFromSchema<TSchema[number]>[] = [];
			for (const a of anchorNodes) {
				const simpleTree = getOrCreateSimpleTree(context, a);
				if (!isTreeValue(simpleTree)) {
					simpleTreeNodes.push(simpleTree as NodeFromSchema<TSchema[number]>);
				}
			}

			if (hasElement(simpleTreeNodes)) {
				return getValue(simpleTreeNodes);
			}
		},
	);
}

export function createIdentifierIndex(context: FlexTreeContext) {
	assert(context instanceof Context, "Unexpected context implementation");

	// For each node schema, find which field key the identifier field is under.
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
			const [node] = nodes;
			if (treeApi.status(node) !== TreeStatus.InDocument) {
				return undefined;
			}
		},
	);
}

function getOrCreateSimpleTree(
	context: Context,
	anchorNode: AnchorNode,
): TreeNode | TreeValue {
	return (
		tryGetProxy(anchorNode) ??
		getOrCreateNodeProxy(
			anchorNode.slots.get(flexTreeSlot) ?? makeFlexNode(context, anchorNode),
		)
	);
}

function makeFlexNode(context: Context, anchorNode: AnchorNode): FlexTreeNode {
	const cursor = context.forest.allocateCursor();
	context.forest.moveCursorToPath(anchorNode, cursor);
	const flexNode = makeTree(context, cursor);
	cursor.free();
	return flexNode;
}

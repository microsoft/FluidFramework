/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	AnchorNode,
	FieldKey,
	ITreeSubscriptionCursor,
	TreeNodeSchemaIdentifier,
} from "../../core/index.js";
// todo fix this
// eslint-disable-next-line import/no-internal-modules
import { makeTree } from "../../feature-libraries/flex-tree/lazyNode.js";
import {
	type Context,
	AnchorTreeIndex,
	isTreeValue,
	type TreeIndexNodes,
	hasElement,
	type TreeIndex,
	type TreeIndexKey,
	type KeyFinder,
} from "../../feature-libraries/index.js";
import { brand, fail } from "../../util/index.js";
import type { ImplicitFieldSchema, NodeFromSchema } from "../schemaTypes.js";
import {
	getOrCreateNodeFromInnerNode,
	type TreeNode,
	type TreeNodeSchema,
} from "../core/index.js";
import { ObjectNodeSchema } from "../objectNodeTypes.js";
import { treeNodeApi } from "./treeNodeApi.js";
// todo
// eslint-disable-next-line import/no-internal-modules
import { proxySlot } from "../core/treeNodeKernel.js";
import type { TreeView } from "./tree.js";
import { walkFieldSchema } from "../walkFieldSchema.js";
// todo
// eslint-disable-next-line import/no-internal-modules
import type { SchematizingSimpleTreeView } from "../../shared-tree/schematizingTreeView.js";

/**
 * A {@link TreeIndex} that returns tree nodes given their associated keys.
 *
 * @alpha
 */
export type SimpleTreeIndex<TKey extends TreeIndexKey, TValue> = TreeIndex<TKey, TValue>;

/**
 * Creates a {@link SimpleTreeIndex} with a specified indexer.
 *
 * @param view - the view for the tree being indexed
 * @param indexer - a function that takes in a {@link TreeNodeSchema} and returns the field name that all nodes of the given schema should be keyed on
 * @param getValue - given at least one {@link TreeNode}, returns an associated value
 * @param isKeyValid - function for verifying the validity of the key retrieved based on the information given by the indexer
 *
 * @alpha
 */
export function createSimpleTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
>(
	view: TreeView<TFieldSchema>,
	indexer: (schema: TreeNodeSchema) => string | undefined,
	getValue: (nodes: TreeIndexNodes<TreeNode>) => TValue,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
): SimpleTreeIndex<TKey, TValue>;
/**
 * Creates a {@link SimpleTreeIndex} with a specified indexer.
 *
 * @param view - the view for the tree being indexed
 * @param indexer - - a function that takes in a {@link TreeNodeSchema} and returns the field name that all nodes of the given schema should be keyed on
 * @param getValue - given at least one {@link TreeNode}, returns an associated value
 * @param isKeyValid - function for verifying the validity of the key retrieved based on the information given by the indexer
 * @param indexableSchema - a list of all the schema types that can be indexed
 *
 * @alpha
 */
export function createSimpleTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
	TSchema extends TreeNodeSchema,
>(
	view: TreeView<TFieldSchema>,
	indexer: (schema: TSchema) => string | undefined,
	getValue: (nodes: TreeIndexNodes<NodeFromSchema<TSchema>>) => TValue,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
	indexableSchema: readonly TSchema[],
): SimpleTreeIndex<TKey, TValue>;
/**
 * Creates a {@link SimpleTreeIndex} with a specified indexer.
 *
 * @alpha
 */
export function createSimpleTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
>(
	view: TreeView<TFieldSchema>,
	indexer: (schema: TreeNodeSchema) => string | undefined,
	getValue:
		| ((nodes: TreeIndexNodes<TreeNode>) => TValue)
		| ((nodes: TreeIndexNodes<NodeFromSchema<TreeNodeSchema>>) => TValue),
	isKeyValid: (key: TreeIndexKey) => key is TKey,
	indexableSchema?: readonly TreeNodeSchema[],
): SimpleTreeIndex<TKey, TValue> {
	const indexableSchemaMap = new Map();
	if (indexableSchema !== undefined) {
		for (const schemus of indexableSchema) {
			indexableSchemaMap.set(schemus.identifier, schemus);
		}
	} else {
		walkFieldSchema(view.schema, {
			node: (schemus) => indexableSchemaMap.set(schemus.identifier, schemus),
		});
	}

	const schemaIndexer =
		indexableSchema === undefined
			? (schemaIdentifier: TreeNodeSchemaIdentifier) => {
					// if indexable schema isn't provided, we check if the node is in schema
					const schemus = indexableSchemaMap.get(schemaIdentifier);
					if (schemus !== undefined) {
						const keyLocation = indexer(schemus);
						if (keyLocation !== undefined) {
							return makeGenericKeyFinder<TKey>(brand(keyLocation), isKeyValid);
						}
					} else {
						fail("node is out of schema");
					}
				}
			: (schemaIdentifier: TreeNodeSchemaIdentifier) => {
					const schemus = indexableSchemaMap.get(schemaIdentifier);
					if (schemus !== undefined) {
						const keyLocation = indexer(schemus);
						if (keyLocation !== undefined) {
							return makeGenericKeyFinder<TKey>(brand(keyLocation), isKeyValid);
						}
					}
				};

	const index = new AnchorTreeIndex<TKey, TValue>(
		(view as SchematizingSimpleTreeView<TFieldSchema>).getView().checkout.forest,
		schemaIndexer,
		(anchorNodes) => {
			const simpleTreeNodes: TreeNode[] = [];
			for (const a of anchorNodes) {
				const simpleTree = getOrCreateSimpleTree(view, a);
				if (!isTreeValue(simpleTree)) {
					simpleTreeNodes.push(simpleTree);
				}
			}

			if (hasElement(simpleTreeNodes)) {
				return getValue(simpleTreeNodes);
			}
		},
		(anchorNode: AnchorNode) => {
			const simpleTree = getOrCreateSimpleTree(view, anchorNode);
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

function isStringKey(key: TreeIndexKey): key is string {
	return typeof key === "string";
}

/**
 * Creates an {@link IdentifierIndex} for a given {@link TreeView}.
 *
 * @alpha
 */
export function createIdentifierIndex<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): IdentifierIndex {
	// For each node schema, find which field key the identifier field is under.
	// This can be done easily because identifiers are their own field kinds.
	const identifierFields = new Map<string, string>();
	walkFieldSchema(view.schema, {
		node: (schemus) => {
			if (schemus instanceof ObjectNodeSchema) {
				for (const fieldKey of schemus.fields.keys()) {
					identifierFields.set(schemus.identifier, fieldKey);
					break;
				}
			}
		},
	});

	return createSimpleTreeIndex(
		view,
		(schemus) => identifierFields.get(schemus.identifier),
		(nodes) => {
			if (nodes.length > 1) {
				throw new UsageError(
					"cannot retrieve node from index: there are multiple nodes with the same identifier",
				);
			}

			return nodes[0];
		},
		isStringKey,
	);
}

/**
 * Gets a simple tree from an anchor node
 */
function getOrCreateSimpleTree<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
	anchorNode: AnchorNode,
): TreeNode | TreeIndexKey {
	return (
		anchorNode.slots.get(proxySlot) ??
		makeTreeNode((view as SchematizingSimpleTreeView<TSchema>).getView().context, anchorNode)
	);
}

/**
 * Make a tree node from an anchor node
 */
function makeTreeNode(context: Context, anchorNode: AnchorNode): TreeNode | TreeIndexKey {
	const cursor = context.checkout.forest.allocateCursor();
	context.checkout.forest.moveCursorToPath(anchorNode, cursor);
	const flexNode = makeTree(context, cursor);
	cursor.free();
	return getOrCreateNodeFromInnerNode(flexNode);
}

function makeGenericKeyFinder<TKey extends TreeIndexKey>(
	keyField: FieldKey,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
): KeyFinder<TKey> {
	return (cursor: ITreeSubscriptionCursor) => {
		cursor.enterField(keyField);
		cursor.firstNode();
		const value = cursor.value;
		cursor.exitNode();
		cursor.exitField();

		if (value === undefined) {
			fail("a value for the key does not exist");
		}

		if (!isKeyValid(value)) {
			fail("the key is an unexpected type");
		}

		return value;
	};
}

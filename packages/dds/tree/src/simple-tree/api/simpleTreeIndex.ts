/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

import type {
	AnchorNode,
	FieldKey,
	ITreeSubscriptionCursor,
	TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import {
	AnchorTreeIndex,
	isTreeValue,
	type TreeIndexNodes,
	hasElement,
	type TreeIndex,
	type KeyFinder,
} from "../../feature-libraries/index.js";
import type { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import { brand } from "../../util/index.js";
import {
	treeNodeFromAnchor,
	type TreeNode,
	type TreeNodeSchema,
	type NodeFromSchema,
	type TreeLeafValue,
} from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import { walkFieldSchema } from "../walkFieldSchema.js";

import type { TreeView } from "./tree.js";
import { treeNodeApi } from "./treeNodeApi.js";

/**
 * Value that may be used as keys in a {@link TreeIndex}.
 * @remarks
 * This supports values which have value semantics and are compared by value, just like {@link TreeLeafValue}.
 * This allows using any tree value as a key (for example in an index tracking where those values occur in the tree).
 * The `isKeyValid` parameter of {@link (createTreeIndex:1)} narrows this union to the key type exposed by the index.
 * @beta
 */
export type TreeIndexKey = TreeLeafValue;

/**
 * Selects the field containing the index key for nodes of a given schema.
 *
 * @remarks
 * A `TreeIndexer` is logically a pure function. For convenience, an object with a `get` method, such as a
 * `ReadonlyMap`, is also accepted. Return `undefined` for schemas that should not be indexed.
 *
 * @typeParam TSchema - The node schema types accepted by the indexer.
 *
 * @beta
 */
export type TreeIndexer<TSchema extends TreeNodeSchema = TreeNodeSchema> =
	| ((schema: TSchema) => string | undefined)
	| { get(schema: TSchema): string | undefined };

/**
 * Creates a {@link TreeIndex}, selecting the key field for each schema in the view.
 *
 * @remarks
 * This overload discovers the schemas to consider by walking the view's schema.
 * When multiple nodes have the same key, they are passed together to `getValue`.
 * Use {@link (createTreeIndex:2)} to narrow the indexed schema and the node types passed to `getValue`.
 * To index identifier fields, use {@link createIdentifierIndex}.
 *
 * @param view - The view for the tree being indexed.
 * @param indexer - Selects the field whose value is the index key for nodes of each schema.
 * @param getValue - Converts the non-empty array of nodes associated with a key into the value returned for that key.
 * @param isKeyValid - Validates and narrows values read from key fields to `TKey`. An invalid value causes an error.
 *
 * @beta
 */
export function createTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
>(
	view: TreeView<TFieldSchema>,
	indexer: TreeIndexer,
	getValue: (nodes: TreeIndexNodes<TreeNode>) => TValue,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
): TreeIndex<TKey, TValue>;

/**
 * Creates a {@link TreeIndex}, selecting the key field for an explicit set of schemas.
 *
 * @remarks
 * Supplying `indexableSchema` avoids schema discovery and narrows the nodes passed to `getValue` to
 * {@link NodeFromSchema} of the supplied schema types. Schemas omitted from `indexableSchema` are not indexed.
 * When multiple nodes have the same key, they are passed together to `getValue`.
 *
 * @param view - The view for the tree being indexed.
 * @param indexer - Selects the field whose value is the index key for nodes of each supplied schema.
 * @param getValue - Converts the non-empty array of nodes associated with a key into the value returned for that key.
 * @param isKeyValid - Validates and narrows values read from key fields to `TKey`. An invalid value causes an error.
 * @param indexableSchema - All schema types that the index should consider.
 *
 * @beta
 */
export function createTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
	TSchema extends TreeNodeSchema,
>(
	view: TreeView<TFieldSchema>,
	indexer: TreeIndexer<TSchema>,
	getValue: (nodes: TreeIndexNodes<NodeFromSchema<TSchema>>) => TValue,
	isKeyValid: (key: TreeIndexKey) => key is TKey,
	indexableSchema: readonly TSchema[],
): TreeIndex<TKey, TValue>;

/**
 * Creates a {@link TreeIndex} with a specified indexer.
 *
 * @beta
 */
export function createTreeIndex<
	TFieldSchema extends ImplicitFieldSchema,
	TKey extends TreeIndexKey,
	TValue,
>(
	view: TreeView<TFieldSchema>,
	indexer: TreeIndexer,
	getValue:
		| ((nodes: TreeIndexNodes<TreeNode>) => TValue)
		| ((nodes: TreeIndexNodes<NodeFromSchema<TreeNodeSchema>>) => TValue),
	isKeyValid: (key: TreeIndexKey) => key is TKey,
	indexableSchema?: readonly TreeNodeSchema[],
): TreeIndex<TKey, TValue> {
	const indexableSchemaMap = new Map<string, TreeNodeSchema>();
	if (indexableSchema === undefined) {
		walkFieldSchema(view.schema, {
			node: (schemus) => indexableSchemaMap.set(schemus.identifier, schemus),
		});
	} else {
		for (const schemus of indexableSchema) {
			indexableSchemaMap.set(schemus.identifier, schemus);
		}
	}

	const schemaIndexer =
		indexableSchema === undefined
			? (schemaIdentifier: TreeNodeSchemaIdentifier) => {
					// if indexable schema isn't provided, we check if the node is in schema
					const schemus = indexableSchemaMap.get(schemaIdentifier);
					if (schemus === undefined) {
						fail(0xb32 /* node is out of schema */);
					} else {
						const keyLocation =
							typeof indexer === "function" ? indexer(schemus) : indexer.get(schemus);
						if (keyLocation !== undefined) {
							return makeGenericKeyFinder<TKey>(brand(keyLocation), isKeyValid);
						}
					}
				}
			: (schemaIdentifier: TreeNodeSchemaIdentifier) => {
					const schemus = indexableSchemaMap.get(schemaIdentifier);
					if (schemus !== undefined) {
						const keyLocation =
							typeof indexer === "function" ? indexer(schemus) : indexer.get(schemus);
						if (keyLocation !== undefined) {
							return makeGenericKeyFinder<TKey>(brand(keyLocation), isKeyValid);
						}
					}
				};

	const index = new AnchorTreeIndex<TKey, TValue>(
		(view as SchematizingSimpleTreeView<TFieldSchema>).checkout.forest,
		schemaIndexer,
		(anchorNodes) => {
			const simpleTreeNodes: TreeNode[] = [];
			for (const anchorNode of anchorNodes) {
				const simpleTree = treeNodeFromAnchor(anchorNode);
				if (!isTreeValue(simpleTree)) {
					simpleTreeNodes.push(simpleTree);
				}
			}

			if (hasElement(simpleTreeNodes)) {
				return getValue(simpleTreeNodes);
			}
		},
		(anchorNode: AnchorNode) => {
			const simpleTree = treeNodeFromAnchor(anchorNode);
			if (!isTreeValue(simpleTree)) {
				return treeNodeApi.status(simpleTree);
			}
		},
		// simple tree indexes are shallow indexes, indicating so allows for a performance optimization
		true,
	);

	// all the type checking guarantees that we put nodes of the correct type in the index
	// but it's not captured in the type system
	return index as TreeIndex<TKey, TValue>;
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
			fail(0xb33 /* a value for the key does not exist */);
		}

		if (!isKeyValid(value)) {
			fail(0xb34 /* the key is an unexpected type */);
		}

		return value;
	};
}

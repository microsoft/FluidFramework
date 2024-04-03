/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { rootFieldKey } from "../core/index.js";
import {
	FlexTreeNodeEvents,
	LeafNodeSchema,
	Multiplicity,
	TreeStatus,
	isTreeValue,
	valueSchemaAllows,
} from "../feature-libraries/index.js";
import { fail } from "../util/index.js";

import { getOrCreateNodeProxy } from "./proxies.js";
import { getFlexNode, tryGetFlexNode } from "./proxyBinding.js";
import { tryGetSimpleNodeSchema } from "./schemaCaching.js";
import { schemaFromValue } from "./schemaFactory.js";
import {
	NodeFromSchema,
	NodeKind,
	type TreeLeafValue,
	TreeNodeSchema,
	type StoredKey,
	type ImplicitFieldSchema,
	FieldSchema,
} from "./schemaTypes.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { TreeNode } from "./types.js";

/**
 * Provides various functions for analyzing {@link TreeNode}s.
 *
 * @privateRemarks
 * Inlining the typing of this interface onto the `Tree` object provides slightly different .d.ts generation,
 * which avoids typescript expanding the type of TreeNodeSchema and thus encountering
 * https://github.com/microsoft/rushstack/issues/1958.
 * @public
 */
export interface TreeNodeApi {
	/**
	 * The schema information for this node.
	 */
	schema<T extends TreeNode | TreeLeafValue>(
		node: T,
	): TreeNodeSchema<string, NodeKind, unknown, T>;
	/**
	 * Narrow the type of the given value if it satisfies the given schema.
	 * @example
	 * ```ts
	 * if (node.is(myNode, point)) {
	 *     const y = myNode.y; // `myNode` is now known to satisfy the `point` schema and therefore has a `y` coordinate.
	 * }
	 * ```
	 */
	is<TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is NodeFromSchema<TSchema>;

	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	parent(node: TreeNode): TreeNode | undefined;

	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * If `node` is an element in a {@link (TreeArrayNode:interface)}, this returns the index of `node` in the array node (a `number`).
	 * Otherwise, this returns the key of the field that it is under (a `string`).
	 */
	key(node: TreeNode): string | number;

	/**
	 * Register an event listener on the given node.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	on<K extends keyof TreeNodeEvents>(
		node: TreeNode,
		eventName: K,
		listener: TreeNodeEvents[K],
	): () => void;
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	readonly status: (node: TreeNode) => TreeStatus;
}

/**
 * The `Tree` object holds various functions for analyzing {@link TreeNode}s.
 */
export const treeNodeApi: TreeNodeApi = {
	parent: (node: TreeNode): TreeNode | undefined => {
		const editNode = getFlexNode(node).parentField.parent.parent;
		if (editNode === undefined) {
			return undefined;
		}

		const output = getOrCreateNodeProxy(editNode);
		assert(
			!isTreeValue(output),
			0x87f /* Parent can't be a leaf, so it should be a node not a value */,
		);
		return output;
	},
	key: (node: TreeNode) => {
		// If the parent is undefined, then this node is under the root field,
		// so we know its key is the special root one.
		const parent = treeNodeApi.parent(node);
		if (parent === undefined) {
			return rootFieldKey;
		}

		// The flex-domain strictly operates in terms of "stored keys".
		// To find the associated developer-facing "view key", we need to look up the field associated with
		// the stored key from the flex-domain, and get view key its simple-domain counterpart was created with.
		const storedKey = getStoredKey(node);
		const parentSchema = treeNodeApi.schema(parent);
		const viewKey = getViewKeyFromStoredKey(parentSchema, storedKey);
		return viewKey;
	},
	on: <K extends keyof FlexTreeNodeEvents>(
		node: TreeNode,
		eventName: K,
		listener: FlexTreeNodeEvents[K],
	) => {
		return getFlexNode(node).on(eventName, listener);
	},
	status: (node: TreeNode) => {
		return getFlexNode(node, true).treeStatus();
	},
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is NodeFromSchema<TSchema> => {
		const flexSchema = getFlexSchema(schema);
		if (isTreeValue(value)) {
			return (
				flexSchema instanceof LeafNodeSchema && valueSchemaAllows(flexSchema.info, value)
			);
		}
		return tryGetFlexNode(value)?.is(flexSchema) ?? false;
	},
	schema<T extends TreeNode | TreeLeafValue>(
		node: T,
	): TreeNodeSchema<string, NodeKind, unknown, T> {
		if (isTreeValue(node)) {
			return schemaFromValue(node) as TreeNodeSchema<string, NodeKind, unknown, T>;
		}
		return tryGetSimpleNodeSchema(getFlexNode(node).schema) as TreeNodeSchema<
			string,
			NodeKind,
			unknown,
			T
		>;
	},
};

/**
 * Gets the stored key with which the provided node is associated in the parent.
 */
function getStoredKey(node: TreeNode): StoredKey | number {
	// Note: the flex domain strictly works with "stored keys", and knows nothing about the developer-facing
	// "view keys".
	const parentField = getFlexNode(node).parentField;
	if (parentField.parent.schema.kind.multiplicity === Multiplicity.Sequence) {
		// The parent of `node` is an array node
		return parentField.index;
	}

	// The parent of `node` is an object, a map, or undefined (and therefore `node` is a root/detached node).
	return parentField.parent.key;
}

/**
 * Given a node schema, gets the view key corresponding with the provided {@link StoredKey | stored key}.
 */
function getViewKeyFromStoredKey(
	schema: TreeNodeSchema,
	storedKey: StoredKey | number,
): string | number {
	// Only object nodes have the concept of a "stored key", differentiated from the developer-facing "view key".
	// For any other kind of node, the stored key and the view key are the same.
	if (schema.kind !== NodeKind.Object) {
		return storedKey;
	}

	const fields = schema.info as Record<string, ImplicitFieldSchema>;

	// Invariants:
	// - The set of all view keys under an object must be unique.
	// - The set of all stored keys (including those implicitly created from view keys) must be unique.
	// To find the view key associated with the provided stored key, first check for any stored key matches (which are optionally populated).
	// If we don't find any, then search for a matching view key.
	for (const [viewKey, fieldSchema] of Object.entries(fields)) {
		if (fieldSchema instanceof FieldSchema && fieldSchema.props?.key === storedKey) {
			return viewKey;
		}
	}

	if (fields[storedKey] === undefined) {
		fail("Existing stored key should always map to a view key");
	}

	return storedKey;
}

/**
 * A collection of events that can be raised by a {@link TreeNode}.
 * @public
 */
export interface TreeNodeEvents {
	/**
	 * Raised on a node right after a change is applied to one of its fields or the fields of a descendant node.
	 */
	afterChange(): void;
}

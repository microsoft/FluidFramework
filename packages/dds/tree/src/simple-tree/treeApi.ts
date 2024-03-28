/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { TreeValue, rootFieldKey } from "../core/index.js";
import {
	FlexTreeNodeEvents,
	LeafNodeSchema,
	Multiplicity,
	TreeStatus,
	isTreeValue,
	valueSchemaAllows,
} from "../feature-libraries/index.js";
import { getOrCreateNodeProxy, getProxyForField, getSimpleSchema } from "./proxies.js";
import { getFlexNode, tryGetFlexNode } from "./proxyBinding.js";
import { schemaFromValue } from "./schemaFactory.js";
import {
	NodeFromSchema,
	NodeKind,
	TreeLeafValue,
	TreeNodeSchema,
	type StoredKey,
	type ImplicitFieldSchema,
	FieldSchema,
} from "./schemaTypes.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { TreeNode } from "./types.js";
import { brand } from "../util/index.js";

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
	 * Gets the child node based on its `stableName`.
	 * @remarks This method is intended to be used when the developer-facing key for a particular child
	 * is not known, and only the `stableName` is known.
	 * @param node - TODO
	 * @param storedKey - TODO
	 * @returns TODO
	 */
	child(node: TreeNode, storedKey: StoredKey): TreeNode | TreeValue | undefined;

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
	 * TODO
	 * @param node - TODO
	 * @returns TODO
	 */
	storedKey(node: TreeNode): StoredKey | number;

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
	child: (node: TreeNode, storedKey: StoredKey) => {
		const editNode = getFlexNode(node);
		const flexField = editNode.tryGetField(brand(storedKey));

		return flexField === undefined ? undefined : getProxyForField(flexField);
	},
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
		const storedKey = treeNodeApi.storedKey(node);
		const viewKey = tryGetViewKeyFromStoredKey(parent, storedKey);
		assert(viewKey !== undefined, "Existing stableName should always map to a devKey");
		return viewKey;
	},
	storedKey: (node: TreeNode): StoredKey | number => {
		// Note: the flex domain strictly works with `stableName`s, and knows nothing of developer keys.
		const parentField = getFlexNode(node).parentField;
		if (parentField.parent.schema.kind.multiplicity === Multiplicity.Sequence) {
			// The parent of `node` is an array node
			return parentField.index;
		}

		// The parent of `node` is an object, a map, or undefined (and therefore `node` is a root/detached node).
		return parentField.parent.key;
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
	schema<T extends TreeNode | TreeValue>(node: T): TreeNodeSchema<string, NodeKind, unknown, T> {
		if (isTreeValue(node)) {
			return schemaFromValue(node) as TreeNodeSchema<string, NodeKind, unknown, T>;
		}
		return getSimpleSchema(getFlexNode(node).schema) as TreeNodeSchema<
			string,
			NodeKind,
			unknown,
			T
		>;
	},
};

/**
 * TODO
 */
function tryGetViewKeyFromStoredKey(
	tree: TreeNode,
	storedKey: StoredKey | number,
): string | number | undefined {
	// Only object nodes have the concept of a "stored key", differentiated from the developer-facing "view key".
	// For any other kind of node, the stored key and the view key are the same.
	const schema = treeNodeApi.schema(tree);
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

	return fields[storedKey] === undefined ? undefined : storedKey;
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

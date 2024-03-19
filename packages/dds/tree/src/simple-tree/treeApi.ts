/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { TreeValue } from "../core/index.js";
import {
	EditableTreeEvents,
	LeafNodeSchema,
	Multiplicity,
	TreeStatus,
	isTreeValue,
	valueSchemaAllows,
} from "../feature-libraries/index.js";
import { brand } from "../util/index.js";
import { getClassSchema } from "./classSchemaCaching.js";
import { getFlexNode, tryGetFlexNode } from "./flexNode.js";
import { getOrCreateNodeProxy, getProxyForField } from "./proxies.js";
import { schemaFromValue } from "./schemaFactory.js";
import {
	FieldSchema,
	type ImplicitFieldSchema,
	NodeFromSchema,
	NodeKind,
	TreeLeafValue,
	TreeNodeSchema,
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

	// TODO: update docs to note that this is not necessarily the persisted key (stableName).
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
	 */
	stableName(node: TreeNode): string | number;

	// TODO: maybe child(stableName)? Or maybe `devKeyForStableName(stableName)` - from which they can walk the tree as normal?

	/**
	 * Gets the child node based on its `stableName`.
	 * @remarks This method is intended to be used when the developer-facing key for a particular child
	 * is not known, and only the `stableName` is known.
	 * @param node - TODO
	 * @param stableName - TODO
	 */
	child(node: TreeNode, stableName: string): TreeNode | TreeValue | undefined;

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
	child: (node: TreeNode, stableName: string) => {
		const editNode = getFlexNode(node);
		const flexField = editNode.tryGetField(brand(stableName));

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
		const stableName = treeNodeApi.stableName(node);
		const devKey = tryGetKeyFromStableName(node, stableName);
		assert(devKey !== undefined, 0x880 /* Existing stableName should always map to a devKey */);
		return devKey;
	},
	stableName: (node: TreeNode) => {
		const parentField = getFlexNode(node).parentField;
		if (parentField.parent.schema.kind.multiplicity === Multiplicity.Sequence) {
			// The parent of `node` is an array node
			return parentField.index;
		}

		// The parent of `node` is an object, a map, or undefined (and therefore `node` is a root/detached node).
		return parentField.parent.key;
	},
	on: <K extends keyof EditableTreeEvents>(
		node: TreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
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
		return getClassSchema(getFlexNode(node).schema) as TreeNodeSchema<
			string,
			NodeKind,
			unknown,
			T
		>;
	},
};

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

/**
 * TODO
 */
function tryGetKeyFromStableName(
	tree: TreeNode,
	stableName: string | number,
): string | number | undefined {
	// Only object nodes have the concept of a stableName, differentiated from the developer-facing key.
	// For any other kind of node, the stableName and developer-facing key are the same.
	const schema = treeNodeApi.schema(tree);
	if (schema.kind !== NodeKind.Object) {
		return stableName;
	}

	// The simple-tree layer maps from developer-facing keys to schemas, which may or may not include
	// `stableName`s. Search the field schemas for one with the specified.
	// Note: tree creation / insertion validates that naming conflicts do not occur between multiple
	// schemas' `stableName`s or between `stableName`s and developer-facing keys, so if we find a match
	// here, we know we are returning the right key.

	const fields = schema.info as Record<string, ImplicitFieldSchema>;

	// If there is a direct key match, then there must not have been a custom `stableName` provided,
	// and therefore the `stableName` and developer-facing key must be the same.
	if (fields[stableName] !== undefined) {
		return stableName;
	}

	// If we didn't find a direct key match above, then either a `stableName` was provided for one of
	// the schemas, or no such `stableName`/key exists.
	for (const [fieldDevKey, fieldSchema] of Object.entries(fields)) {
		if (fieldSchema instanceof FieldSchema && fieldSchema.props?.stableName === stableName) {
			return fieldDevKey;
		}
	}

	return undefined;
}

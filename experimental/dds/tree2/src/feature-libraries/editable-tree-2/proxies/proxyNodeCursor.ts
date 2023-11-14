/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { type Value, type FieldKey, EmptyKey, TreeTypeSet, rootFieldKey } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { leaf } from "../../../domains/leafDomain";
import {
	ContextuallyTypedNodeData,
	TreeDataContext,
	getPossibleTypes,
	isFluidHandle,
	isPrimitiveValue,
} from "../../contextuallyTyped";
import {
	type CursorAdapter,
	type CursorWithNode,
	stackTreeNodeCursor,
	stackTreeFieldCursor,
} from "../../treeCursorUtils";
import { type TreeNodeSchema } from "../../typed-schema";
import { type ProxyNode } from "./types";

/**
 * Creates a {@link CursorAdaptor} capable of mapping proxy-domain trees to the editable tree domain.
 *
 * @param context - The {@link TreeEntity.context} of the parent node under which the tree is being inserted.
 * @param typeSet - The types allowed under the parent node under which the tree is being inserted.
 *
 * @privateRemarks
 * This is exported solely for testing purposes.
 * Consumers should use {@link cursorFromProxyTree} instead.
 */
export function createProxyTreeAdapter<TNode extends ProxyNode<TreeNodeSchema, "javaScript">>(
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): CursorAdapter<TNode> {
	return {
		value: (node: TNode) => {
			return isPrimitiveValue(node) || node === null || isFluidHandle(node)
				? (node as Value)
				: undefined;
		},
		type: (node: TNode) => {
			if (node === undefined) {
				throw new Error("undefined node");
			}
			if (node === null) {
				return leaf.null.name;
			}

			switch (typeof node) {
				case "number":
					return leaf.number.name;
				case "string":
					return leaf.string.name;
				case "boolean":
					return leaf.boolean.name;
				default: {
					if (isFluidHandle(node)) {
						return leaf.handle.name;
					}

					const possibleTypes = getPossibleTypes(
						context,
						typeSet,
						node as ContextuallyTypedNodeData,
					);
					assert(
						possibleTypes.length !== 0,
						"data is incompatible with all types allowed by the schema",
					);
					assert(
						possibleTypes.length === 1,
						"data is compatible with more than one type allowed by the schema",
					);
					return possibleTypes[0];
				}
			}
		},
		keysFromNode: (node: TNode) => {
			switch (typeof node) {
				case "object":
					if (node === null) {
						return [];
					} else if (Array.isArray(node)) {
						// A list with no children is considered to not have any fields.
						// If it has children, return the special symbol indicating a list.
						return node.length === 0 ? [] : [EmptyKey];
					} else if (node instanceof Map) {
						const unfilteredKeys = Array.from(node.keys()) as FieldKey[];
						// Map proxies may contain entries with explicit `undefined` values.
						// We wish to omit these from our representation.
						// Setting a key's value to `undefined` is equivalent to omitting the entry.
						const filteredKeys = unfilteredKeys.filter(
							(key) => node.get(key) !== undefined,
						);
						return filteredKeys;
					} else {
						// Assume record-like object
						const objectedNode = node as Record<FieldKey, unknown>;

						const unfilteredKeys = Object.keys(node) as FieldKey[];
						// Object proxies may contain entries with explicit `undefined` values.
						// We wish to omit these from our representation.
						// Setting a key's value to `undefined` is equivalent to omitting the key/value pair.
						const filteredKeys = unfilteredKeys.filter((key) => {
							const value = objectedNode[key];
							return value !== undefined;
						});
						return filteredKeys;
					}
				default:
					return [];
			}
		},
		getFieldFromNode: (node: TNode, key: FieldKey): readonly TNode[] => {
			// Object.prototype.hasOwnProperty can return true for strings (ex: with key "0"), so we have to filter them out.
			// Rather than just special casing strings, we can handle them with an early return for all primitives.
			if (typeof node !== "object") {
				return [];
			}

			if (node === null) {
				return [];
			}

			if (Array.isArray(node)) {
				// TODO: verify this
				return key === EmptyKey || key === rootFieldKey ? node : [];
			}

			if (node instanceof Map) {
				const value = (node as Map<FieldKey, TNode>).get(key);
				return value === undefined ? [] : [value];
			}

			if (Object.prototype.hasOwnProperty.call(node, key)) {
				const field = (node as Record<FieldKey, TNode>)[key];
				return field === undefined ? [] : [field];
			}

			return [];
		},
	};
}

/**
 * Construct a {@link CursorWithNode} from a {@link ProxyNode}.
 *
 * @param node - The tree being inserted, which will be mapped to the editable tree domain via {@link createProxyTreeAdapter}.
 * @param context - The {@link TreeEntity.context} of the parent node under which the tree is being inserted.
 * @param typeSet - The types allowed under the parent node under which the tree is being inserted.
 * @param mode - The mode of cursor creation.
 * Determines whether the cursor is initialized in "node" mode or "field" mode.
 */
export function cursorFromProxyTree<TNode extends ProxyNode<TreeNodeSchema, "javaScript">>(
	node: TNode,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
	mode: "node" | "field" = "node",
): CursorWithNode<TNode> {
	const adapter = createProxyTreeAdapter<TNode>(context, typeSet);
	return mode === "node"
		? stackTreeNodeCursor(adapter, node)
		: stackTreeFieldCursor(adapter, node);
}

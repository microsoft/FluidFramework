/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Value, type FieldKey, EmptyKey } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { leaf } from "../../../domains/leafDomain";
import { isFluidHandle, isPrimitiveValue } from "../../contextuallyTyped";
import {
	type CursorAdapter,
	singleStackTreeCursor,
	type CursorWithNode,
} from "../../treeCursorUtils";
import { type TreeNodeSchema } from "../../typed-schema";
import { SharedTreeNode, type ProxyNode } from "./types";
import { nodeApi } from "./node";

function createAdaptor<TNode extends ProxyNode<TreeNodeSchema>>(): CursorAdapter<TNode> {
	return {
		value: (node: TNode) => {
			return isPrimitiveValue(node) || node === null || isFluidHandle(node)
				? (node as Value)
				: undefined;
		},
		type: (node: TNode) => {
			if (node === null) {
				return leaf.null.name;
			}

			if (isFluidHandle(node)) {
				return leaf.handle.name;
			}

			switch (typeof node) {
				case "number":
					return leaf.number.name;
				case "string":
					return leaf.string.name;
				case "boolean":
					return leaf.boolean.name;
				default:
					// Assume tree node
					return nodeApi.schema(node as SharedTreeNode).name;
			}
		},
		keysFromNode: (node: TNode) => {
			switch (typeof node) {
				case "object":
					if (node === null) {
						return [];
					} else if (Array.isArray(node)) {
						return node.length === 0 ? [] : [EmptyKey];
					} else if (node instanceof Map) {
						return Array.from(node.keys()) as FieldKey[];
					} else {
						// Assume record-like object
						return (Object.keys(node) as FieldKey[]).filter((key) => {
							const value = (node as Record<FieldKey, unknown>)[key];
							return !Array.isArray(value) || value.length !== 0;
						});
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
				return key === EmptyKey ? node : [];
			}

			if (node instanceof Map) {
				return (node as Map<FieldKey, TNode[]>).get(key) ?? [];
			}

			if (Object.prototype.hasOwnProperty.call(node, key)) {
				const field = (node as Record<FieldKey, TNode>)[key];
				return [field];
			}

			return [];
		},
	};
}

/**
 * Construct a {@link CursorWithNode} from a {@link ProxyNode}.
 */
export function cursorFromProxyTreeNode<TNode extends ProxyNode<TreeNodeSchema>>(
	data: TNode,
): CursorWithNode<TNode> {
	const adapter = createAdaptor<TNode>();
	return singleStackTreeCursor(data, adapter);
}

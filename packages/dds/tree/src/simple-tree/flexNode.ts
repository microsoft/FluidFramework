/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail } from "../util/index.js";
import {
	FlexObjectNodeSchema,
	FlexFieldNodeSchema,
	FlexMapNodeSchema,
	FlexTreeNode,
	FlexTreeObjectNode,
	FlexTreeFieldNode,
	FlexTreeMapNode,
	assertFlexTreeEntityNotFreed,
} from "../feature-libraries/index.js";
import { TreeNode, TypedNode } from "./types.js";
import { TreeArrayNode } from "./treeArrayNode.js";
import { TreeMapNode } from "./schemaTypes.js";
import { RawTreeNode } from "./rawNode.js";

/** Associates an FlexTreeNode with a target object  */
const targetSymbol = Symbol("FlexNodeTarget");
interface HasTarget {
	[targetSymbol]: TreeNode;
}

/**
 * This is intentionally a WeakMap, rather than a private symbol (e.g. like `targetSymbol`).
 * The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
 * Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
 * via the trap, or the trap not properly handling the special symbol, etc.
 */
const flexNodeMap = new WeakMap<TreeNode, FlexTreeNode>();

/**
 * Retrieves the flex node associated with the given target via {@link setFlexNode}.
 * @remarks Fails if the flex node has not been set.
 */
export function getFlexNode(
	target: TypedNode<FlexObjectNodeSchema>,
	allowFreed?: true,
): FlexTreeObjectNode;
export function getFlexNode(
	target: TreeArrayNode,
	allowFreed?: true,
): FlexTreeFieldNode<FlexFieldNodeSchema>;
export function getFlexNode(
	target: TreeMapNode,
	allowFreed?: true,
): FlexTreeMapNode<FlexMapNodeSchema>;
export function getFlexNode(target: TreeNode, allowFreed?: true): FlexTreeNode;
export function getFlexNode(target: TreeNode, allowFreed = false): FlexTreeNode {
	const node = flexNodeMap.get(target) ?? fail("Target is not associated with a flex node");
	if (!(node instanceof RawTreeNode) && !allowFreed) {
		assertFlexTreeEntityNotFreed(node);
	}
	return node;
}

/**
 * Retrieves the flex node associated with the given target via {@link setFlexNode}, if any.
 */
export function tryGetFlexNode(target: unknown): FlexTreeNode | undefined {
	// Calling 'WeakMap.get()' with primitives (numbers, strings, etc.) will return undefined.
	// This is in contrast to 'WeakMap.set()', which will throw a TypeError if given a non-object key.
	return flexNodeMap.get(target as TreeNode);
}

/**
 * Retrieves the target associated with the given flex node via {@link setFlexNode}, if any.
 */
export function tryGetFlexNodeTarget(flexNode: FlexTreeNode): TreeNode | undefined {
	return (flexNode as Partial<HasTarget>)[targetSymbol];
}

/**
 * Associate the given target object and the given flex node.
 * @returns The target object
 * @remarks
 * This creates a 1:1 mapping between the target and tree node.
 * Either can be retrieved from the other via {@link getFlexNode}/{@link tryGetFlexNode} or {@link tryGetFlexNodeTarget}.
 * If the given target is already mapped to an flex node, the existing mapping will be overwritten.
 * If the given flex node is already mapped to a different target, this function will fail.
 */
export function setFlexNode<T extends TreeNode>(target: T, flexNode: FlexTreeNode): T {
	assert(
		tryGetFlexNodeTarget(flexNode) === undefined,
		0x7f5 /* Cannot associate an flex node with multiple targets */,
	);
	delete (flexNodeMap.get(target) as Partial<HasTarget>)?.[targetSymbol];
	flexNodeMap.set(target, flexNode);
	Object.defineProperty(flexNode, targetSymbol, { value: target, configurable: true });
	return target;
}

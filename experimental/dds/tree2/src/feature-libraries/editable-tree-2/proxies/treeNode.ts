/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import { ObjectNodeSchema, AllowedTypes, FieldNodeSchema, MapSchema } from "../../typed-schema";
import { TreeNode, ObjectNode, FieldNode, MapNode } from "../editableTreeTypes";
import { SharedTreeObject, SharedTreeList, SharedTreeMap, SharedTreeNode } from "./types";

/** Stores a reference to a {@link TreeNode} on a {@link SharedTreeNode}. */
const treeNodeSymbol = Symbol("TreeNode");

// This is intentionally a WeakMap, rather than a private symbol (e.g. like `treeNodeSymbol`).
// The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
// Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
// via the trap, or the trap not properly handling the special symbol, etc.
const treeNodeMap = new WeakMap<SharedTreeNode, TreeNode>();

/**
 * Retrieves the {@link TreeNode} associated with the given target via {@link setTreeNode}.
 * @remarks Fails if the {@link TreeNode} has not been set.
 */
export function getTreeNode<TSchema extends ObjectNodeSchema>(
	target: SharedTreeObject<TSchema>,
): ObjectNode;
export function getTreeNode<TTypes extends AllowedTypes>(
	target: SharedTreeList<TTypes>,
): FieldNode<FieldNodeSchema>;
export function getTreeNode<TSchema extends MapSchema>(
	target: SharedTreeMap<TSchema>,
): MapNode<TSchema>;
export function getTreeNode(target: SharedTreeNode): TreeNode;
export function getTreeNode(target: SharedTreeNode): TreeNode {
	return treeNodeMap.get(target) ?? fail("Target is not associated with a TreeNode");
}

/**
 * Retrieves the {@link TreeNode} associated with the given target via {@link setTreeNode}, if any.
 */
export function tryGetTreeNode(target: unknown): TreeNode | undefined {
	if (typeof target === "object" && target !== null) {
		return treeNodeMap.get(target);
	}
	return undefined;
}

/**
 * Retrieves the target associated with the given {@link TreeNode} via {@link setTreeNode}, if any.
 */
export function tryGetTreeNodeTarget(treeNode: TreeNode): unknown | undefined {
	return (treeNode as { [treeNodeSymbol]?: unknown })[treeNodeSymbol];
}

/**
 * Associate the given target object and the given {@link TreeNode}.
 * @returns The target object
 * @remarks
 * This creates a 1:1 mapping between the target and tree node.
 * Either can be retrieved from the other via {@link getTreeNode} or {@link getTODO}.
 * Mapping multiple targets to tree nodes or visa versa is illegal.
 */
export function setTreeNode<T extends SharedTreeObject<ObjectNodeSchema>>(
	target: T,
	treeNode: ObjectNode,
): T;
export function setTreeNode<T extends SharedTreeList<AllowedTypes>>(
	target: T,
	treeNode: FieldNode<FieldNodeSchema>,
): T;
export function setTreeNode<T extends SharedTreeMap<MapSchema>>(
	target: T,
	treeNode: MapNode<MapSchema>,
): T;
export function setTreeNode<T extends SharedTreeNode>(target: T, treeNode: TreeNode): T {
	treeNodeMap.set(target, treeNode);
	Object.defineProperty(treeNode, treeNodeSymbol, { value: target });
	return target;
}

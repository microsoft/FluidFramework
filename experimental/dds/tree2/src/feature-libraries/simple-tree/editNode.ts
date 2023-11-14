/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail } from "../../util";
import { ObjectNodeSchema, AllowedTypes, FieldNodeSchema, MapNodeSchema } from "../typed-schema";
import { FlexTreeNode, FlexTreeObjectNode, FlexTreeFieldNode, FlexTreeMapNode } from "../flex-tree";
import { SharedTreeObject, TreeList, SharedTreeMap, SharedTreeNode } from "./types";

/** Associates an edit node with a target object  */
const targetSymbol = Symbol("EditNodeTarget");
interface HasTarget {
	[targetSymbol]: SharedTreeNode;
}

/**
 * This is intentionally a WeakMap, rather than a private symbol (e.g. like `editNodeSymbol`).
 * The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
 * Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
 * via the trap, or the trap not properly handling the special symbol, etc.
 */
const editNodeMap = new WeakMap<SharedTreeNode, FlexTreeNode>();

/**
 * Retrieves the edit node associated with the given target via {@link setEditNode}.
 * @remarks Fails if the edit node has not been set.
 */
export function getEditNode<TSchema extends ObjectNodeSchema>(
	target: SharedTreeObject<TSchema>,
): FlexTreeObjectNode;
export function getEditNode<TTypes extends AllowedTypes>(
	target: TreeList<TTypes>,
): FlexTreeFieldNode<FieldNodeSchema>;
export function getEditNode<TSchema extends MapNodeSchema>(
	target: SharedTreeMap<TSchema>,
): FlexTreeMapNode<TSchema>;
export function getEditNode(target: SharedTreeNode): FlexTreeNode;
export function getEditNode(target: SharedTreeNode): FlexTreeNode {
	return editNodeMap.get(target) ?? fail("Target is not associated with an edit node");
}

/**
 * Retrieves the edit node associated with the given target via {@link setEditNode}, if any.
 */
export function tryGetEditNode(target: unknown): FlexTreeNode | undefined {
	if (typeof target === "object" && target !== null) {
		return editNodeMap.get(target as SharedTreeNode);
	}
	return undefined;
}

/**
 * Retrieves the target associated with the given edit node via {@link setEditNode}, if any.
 */
export function tryGetEditNodeTarget(editNode: FlexTreeNode): SharedTreeNode | undefined {
	return (editNode as Partial<HasTarget>)[targetSymbol];
}

/**
 * Associate the given target object and the given edit node.
 * @returns The target object
 * @remarks
 * This creates a 1:1 mapping between the target and tree node.
 * Either can be retrieved from the other via {@link getEditNode}/{@link tryGetEditNode} or {@link tryGetEditNodeTarget}.
 * If the given target is already mapped to an edit node, the existing mapping will be overwritten.
 * If the given edit node is already mapped to a different target, this function will fail.
 */
export function setEditNode<T extends SharedTreeObject<ObjectNodeSchema>>(
	target: T,
	editNode: FlexTreeObjectNode,
): T;
export function setEditNode<T extends TreeList<AllowedTypes>>(
	target: T,
	editNode: FlexTreeFieldNode<FieldNodeSchema>,
): T;
export function setEditNode<T extends SharedTreeMap<MapNodeSchema>>(
	target: T,
	editNode: FlexTreeMapNode<MapNodeSchema>,
): T;
export function setEditNode<T extends SharedTreeNode>(target: T, editNode: FlexTreeNode): T {
	assert(
		tryGetEditNodeTarget(editNode) === undefined,
		"Cannot associate an edit node with multiple targets",
	);
	delete (editNodeMap.get(target) as Partial<HasTarget>)?.[targetSymbol];
	editNodeMap.set(target, editNode);
	Object.defineProperty(editNode, targetSymbol, { value: target, configurable: true });
	return target;
}

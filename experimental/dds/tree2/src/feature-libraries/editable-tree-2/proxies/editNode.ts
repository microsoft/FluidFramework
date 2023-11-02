/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail } from "../../../util";
import { ObjectNodeSchema, AllowedTypes, FieldNodeSchema, MapSchema } from "../../typed-schema";
import { TreeNode, ObjectNode, FieldNode, MapNode } from "../editableTreeTypes";
import { SharedTreeObject, SharedTreeList, SharedTreeMap, SharedTreeNode } from "./types";

/** Stores a reference to an edit node on a {@link SharedTreeNode}. */
const editNodeSymbol = Symbol("EditNode");

/**
 * This is intentionally a WeakMap, rather than a private symbol (e.g. like `editNodeSymbol`).
 * The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
 * Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
 * via the trap, or the trap not properly handling the special symbol, etc.
 */
const editNodeMap = new WeakMap<SharedTreeNode, TreeNode>();

/**
 * Retrieves the edit node associated with the given target via {@link setEditNode}.
 * @remarks Fails if the edit node has not been set.
 */
export function getEditNode<TSchema extends ObjectNodeSchema>(
	target: SharedTreeObject<TSchema>,
): ObjectNode;
export function getEditNode<TTypes extends AllowedTypes>(
	target: SharedTreeList<TTypes>,
): FieldNode<FieldNodeSchema>;
export function getEditNode<TSchema extends MapSchema>(
	target: SharedTreeMap<TSchema>,
): MapNode<TSchema>;
export function getEditNode(target: SharedTreeNode): TreeNode;
export function getEditNode(target: SharedTreeNode): TreeNode {
	return editNodeMap.get(target) ?? fail("Target is not associated with an edit node");
}

/**
 * Retrieves the edit node associated with the given target via {@link setEditNode}, if any.
 */
export function tryGetEditNode(target: unknown): TreeNode | undefined {
	if (typeof target === "object" && target !== null) {
		return editNodeMap.get(target);
	}
	return undefined;
}

/**
 * Retrieves the target associated with the given edit node via {@link setEditNode}, if any.
 */
export function tryGetEditNodeTarget(editNode: TreeNode): unknown | undefined {
	return (editNode as { [editNodeSymbol]?: unknown })[editNodeSymbol];
}

/**
 * Associate the given target object and the given edit node.
 * @returns The target object
 * @remarks
 * This creates a 1:1 mapping between the target and tree node.
 * Either can be retrieved from the other via {@link getEditNode}/{@link tryGetEditNode} or {@link tryGetEditNodeTarget}.
 * Mapping multiple targets to tree nodes or visa versa is illegal.
 */
export function setEditNode<T extends SharedTreeObject<ObjectNodeSchema>>(
	target: T,
	editNode: ObjectNode,
): T;
export function setEditNode<T extends SharedTreeList<AllowedTypes>>(
	target: T,
	editNode: FieldNode<FieldNodeSchema>,
): T;
export function setEditNode<T extends SharedTreeMap<MapSchema>>(
	target: T,
	editNode: MapNode<MapSchema>,
): T;
export function setEditNode<T extends SharedTreeNode>(target: T, editNode: TreeNode): T {
	assert(
		!editNodeMap.has(target) && tryGetEditNodeTarget(editNode) === undefined,
		"Unexpected edit node mapping: mapping already established",
	);
	editNodeMap.set(target, editNode);
	Object.defineProperty(editNode, editNodeSymbol, { value: target });
	return target;
}

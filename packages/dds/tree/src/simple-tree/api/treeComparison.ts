/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeValue } from "../../core/index.js";
import { isTreeValue } from "../../feature-libraries/index.js";
import type { TreeNode } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import type { UnsafeUnknownSchema } from "../unsafeUnknownSchema.js";
import type { TreeViewAlpha } from "./tree.js";
import { treeNodeApi } from "./treeNodeApi.js";

/**
 * Gets all tree nodes that are different between two views by walking both trees.
 *
 * @param originalView - the first view to compare
 * @param newView - the second view to compare against
 * @returns an array of tree nodes from thisView that are either missing in otherView or have different content
 *
 * @remarks
 * This function compares nodes at corresponding positions and identifies differences.
 *
 * The comparison is based on:
 * - Tree structure (parent-child relationships)
 * - Node content (primitive values, object properties)
 * - Node presence (nodes that exist in one tree but not the other)
 *
 * @alpha
 */
export function getTreeDiff<
	TSchemaA extends ImplicitFieldSchema | UnsafeUnknownSchema,
	TSchemaB extends ImplicitFieldSchema | UnsafeUnknownSchema,
>(
	originalView: TreeViewAlpha<TSchemaA>,
	newView: TreeViewAlpha<TSchemaB>,
): ReadonlySet<TreeNode> {
	const changedNodes = new Set<TreeNode>();

	// Start comparison from the root
	const originalRoot = originalView.root as TreeNode;
	const newRoot = newView.root as TreeNode;

	// Handle the root being a primitive
	if (isTreeValue(originalRoot)) {
		if (originalRoot !== newRoot) {
			changedNodes.add(newRoot);
			return changedNodes;
		}
	}

	diffNodes(originalRoot, newRoot, createChangedNodeSaver(changedNodes));

	return changedNodes;
}

// saves a node and its ancestors to the changedNodes set
function createChangedNodeSaver(changedNodes: Set<TreeNode>) {
	return (node: TreeNode | TreeValue, parent?: TreeNode) => {
		if (isTreeValue(node)) {
			// Values are not tracked, so save the parent node instead
			if (parent === undefined) {
				throw new Error("Parent must be provided when saving a TreeValue");
			}
			changedNodes.add(parent);
			return;
		}

		if (!changedNodes.has(node)) {
			changedNodes.add(node);
			let currParent = treeNodeApi.parent(node);
			while (currParent !== undefined) {
				if (changedNodes.has(currParent)) {
					break; // Stop if parent is already marked as changed
				}
				changedNodes.add(currParent);
				currParent = treeNodeApi.parent(currParent);
			}
		}
	};
}

/**
 * Compares two tree nodes and adds any differences to the changedNodes array.
 */
function diffNodes(
	originalNode: TreeNode,
	newNode: TreeNode,
	saveChangedNode: (node: TreeNode | TreeValue, parent?: TreeNode) => void,
): void {
	// primitives should be handled earlier
	if (isTreeValue(originalNode)) {
		return;
	}

	// If new node doesn't exist, this node has been removed from the original path
	if (newNode === undefined) {
		saveChangedNode(originalNode);
		return;
	}

	// If this node doesn't exist originally, it has been added in the new path
	if (originalNode === undefined || originalNode === null) {
		saveChangedNode(newNode);
		return;
	}

	// Compare node types first
	if (typeof originalNode !== typeof newNode) {
		saveChangedNode(newNode);
		return;
	}

	// Handle array nodes
	if (Array.isArray(originalNode)) {
		if (!Array.isArray(newNode) || originalNode.length !== newNode.length) {
			saveChangedNode(newNode);
			return;
		}

		// Compare each element
		for (let i = 0; i < originalNode.length; i++) {
			diffNodes(originalNode[i] as TreeNode, newNode[i] as TreeNode, saveChangedNode);
		}
		return;
	}

	// Handle object nodes
	const originalKeys = Object.keys(originalNode);
	const newKeys = Object.keys(newNode);

	// Check if structure is different
	if (originalKeys.length !== newKeys.length || !originalKeys.every((key) => key in newNode)) {
		saveChangedNode(newNode);
		return;
	}

	// Check if any property values are different
	for (const key of originalKeys) {
		// TODO fix casting
		const originalChild = (originalNode as unknown as Record<string, unknown>)[
			key
		] as TreeNode;
		const newChild = (newNode as unknown as Record<string, unknown>)[key] as TreeNode;

		// Handle tree primitives
		if (isTreeValue(originalChild)) {
			if (originalChild !== newChild) {
				saveChangedNode(newChild, newNode);
			}
			continue;
		}

		diffNodes(originalChild, newChild, saveChangedNode);
	}
}

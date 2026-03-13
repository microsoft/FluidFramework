/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedBaseType } from "@fluidframework/core-interfaces/internal";
import { ErasedTypeImplementation } from "@fluidframework/core-interfaces/internal";

import type { DetachedField } from "../core/index.js";
import type { FlexTreeHydratedContext } from "../feature-libraries/index.js";
import type { TreeNode, TreeBranch, UnhydratedFlexTreeNode } from "../simple-tree/index.js";

// #region ParentObject Types

/**
 * Opaque object representing the parent of a node that is not a TreeNode.
 * Returned by {@link (TreeAlpha:interface).parent2} for nodes that have no TreeNode parent
 * (e.g., root nodes, removed nodes, or newly created nodes not yet inserted into a document).
 *
 * @remarks
 * This is a sealed type - external implementations are not allowed.
 *
 * This object can be passed to {@link (TreeAlpha:interface).child},
 * {@link (TreeAlpha:interface).children}, and {@link (TreeAlpha:interface).on}.
 *
 * @sealed
 * @alpha
 */
export interface ParentObject extends ErasedBaseType<"@fluidframework/tree.ParentObject"> {}

/**
 * The parent of a {@link TreeNode} in the tree hierarchy.
 *
 * @remarks
 * Unlike {@link (TreeNodeApi:interface).parent} which returns `undefined` for root nodes,
 * {@link (TreeAlpha:interface).parent2} always returns a value of this type.
 * This enables the invariant:
 * `TreeAlpha.child(TreeAlpha.parent2(node), TreeAlpha.key2(node)) === node`
 *
 * - {@link TreeNode}: The node has a regular parent node in the tree hierarchy.
 * - {@link ParentObject}: The node has no TreeNode parent (e.g., it is a root node,
 * was removed from the tree, or was newly created and not yet inserted).
 *
 * @alpha
 */
export type TreeNodeParent = TreeNode | ParentObject;

/**
 * Represents a node that is at the root of a hydrated tree branch.
 * @internal
 */
export class RootParent
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	public constructor(private readonly branch: TreeBranch) {
		super();
	}

	/**
	 * Gets the TreeBranch this root parent is associated with.
	 */
	public getBranch(): TreeBranch {
		return this.branch;
	}
}

/**
 * Represents a node that was removed from a hydrated tree but still exists in memory.
 * The node could potentially be re-inserted into the tree.
 * @internal
 */
export class DetachedParent
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	public constructor(
		private readonly context: FlexTreeHydratedContext,
		private readonly detachedField: DetachedField,
		private readonly detachedNode: TreeNode,
	) {
		super();
	}

	/**
	 * Gets the FlexTreeHydratedContext this detached parent is associated with.
	 */
	public getContext(): FlexTreeHydratedContext {
		return this.context;
	}

	/**
	 * Gets the DetachedField identifier for this detached subtree.
	 */
	public getDetachedField(): DetachedField {
		return this.detachedField;
	}

	/**
	 * Gets the detached node.
	 */
	public getDetachedNode(): TreeNode {
		return this.detachedNode;
	}
}

/**
 * Represents a node that was created but never inserted into any document.
 * @internal
 */
export class UnhydratedParent
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	public constructor(
		private readonly context: UnhydratedFlexTreeNode["context"],
		private readonly unhydratedRoot: UnhydratedFlexTreeNode,
	) {
		super();
	}

	/**
	 * Gets the context for this unhydrated node.
	 */
	public getContext(): UnhydratedFlexTreeNode["context"] {
		return this.context;
	}

	/**
	 * Gets the unhydrated root node.
	 */
	public getUnhydratedRoot(): UnhydratedFlexTreeNode {
		return this.unhydratedRoot;
	}
}

// #endregion

// #region ParentObject Caches

/**
 * Cache for RootParent instances (one per branch).
 * @remarks
 * Each TreeBranch has exactly one RootParent, ensuring that `parent2()` returns
 * the same RootParent instance for all root nodes of the same branch.
 */
const rootParentCache = new WeakMap<TreeBranch, RootParent>();

export function getOrCreateRootParent(branch: TreeBranch): RootParent {
	let rootParent = rootParentCache.get(branch);
	if (rootParent === undefined) {
		rootParent = new RootParent(branch);
		rootParentCache.set(branch, rootParent);
	}
	return rootParent;
}

/**
 * Cache for DetachedParent instances.
 * @remarks
 * Keyed by the detached TreeNode itself. A node can only be in one detached field
 * at a time, so keying by node is sufficient. Using WeakMap ensures entries are
 * cleaned up when the node is garbage collected.
 */
const detachedParentCache = new WeakMap<TreeNode, DetachedParent>();

export function getOrCreateDetachedParent(
	context: FlexTreeHydratedContext,
	detachedField: DetachedField,
	detachedNode: TreeNode,
): DetachedParent {
	const cached = detachedParentCache.get(detachedNode);
	// If the node was re-inserted and removed again, it gets a new DetachedField,
	// so we need to replace the stale cached entry.
	if (cached?.getDetachedField() === detachedField) {
		return cached;
	}
	const detachedParent = new DetachedParent(context, detachedField, detachedNode);
	detachedParentCache.set(detachedNode, detachedParent);
	return detachedParent;
}

/**
 * Cache for UnhydratedParent instances.
 * @remarks
 * Keyed by the UnhydratedFlexTreeNode itself. Using WeakMap ensures entries are
 * cleaned up when the unhydrated node is garbage collected (e.g., after hydration
 * when no external references remain).
 */
const unhydratedParentCache = new WeakMap<UnhydratedFlexTreeNode, UnhydratedParent>();

export function getOrCreateUnhydratedParent(
	context: UnhydratedFlexTreeNode["context"],
	unhydratedRoot: UnhydratedFlexTreeNode,
): UnhydratedParent {
	let unhydratedParent = unhydratedParentCache.get(unhydratedRoot);
	if (unhydratedParent === undefined) {
		unhydratedParent = new UnhydratedParent(context, unhydratedRoot);
		unhydratedParentCache.set(unhydratedRoot, unhydratedParent);
	}
	return unhydratedParent;
}

// #endregion

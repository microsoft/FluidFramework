/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedBaseType } from "@fluidframework/core-interfaces/internal";
import { ErasedTypeImplementation } from "@fluidframework/core-interfaces/internal";

import type { DetachedField } from "../core/index.js";
import type { FlexTreeHydratedContext } from "../feature-libraries/index.js";
import type { TreeNode, TreeBranch, UnhydratedFlexTreeNode } from "../simple-tree/index.js";

/**
 * Parent of a root {@link TreeNode}.
 *
 * @remarks
 * Returned by {@link (TreeAlpha:interface).parent2} for nodes that have no TreeNode parent
 * (e.g., root nodes, including the roots of {@link TreeStatus.Removed | Removed} and {@link Unhydrated} trees).
 *
 * Each instance corresponds to a location (not a node). If a root node is moved
 * (e.g., from the document root to a removed tree, or from unhydrated into the document),
 * it will have a different parent, and subscriptions on the old parent will be invalidated.
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
 * Parent above the {@link TreeStatus.InDocument | InDocument} tree of the provided branch.
 */
export class DocumentRootParent
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
 * A location which contained (and might still contain) a {@link TreeStatus.Removed | Removed} root.
 */
export class RemovedRootParent
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	public constructor(
		private readonly context: FlexTreeHydratedContext,
		private readonly detachedField: DetachedField,
		/**
		 * The node which was in this detached field when this parent object was created.
		 * @remarks
		 * Invalidated when this field no longer contains this node.
		 */
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
 * Parent of an {@link Unhydrated} root node that has not yet been inserted into any document.
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

/**
 * Cache for DocumentRootParent instances (one per branch).
 * @remarks
 * Each TreeBranch has exactly one DocumentRootParent, ensuring that `parent2()` returns
 * the same DocumentRootParent instance for all root nodes of the same branch.
 */
const documentRootParentCache = new WeakMap<TreeBranch, DocumentRootParent>();

export function getOrCreateDocumentRootParent(branch: TreeBranch): DocumentRootParent {
	let rootParent = documentRootParentCache.get(branch);
	if (rootParent === undefined) {
		rootParent = new DocumentRootParent(branch);
		documentRootParentCache.set(branch, rootParent);
	}
	return rootParent;
}

/**
 * Cache for RemovedRootParent instances.
 * @remarks
 * Keyed by the detached TreeNode itself. A node can only be in one detached field
 * at a time, so keying by node is sufficient. Using WeakMap ensures entries are
 * cleaned up when the node is garbage collected.
 *
 * Entries are created/updated lazily by {@link getOrCreateRemovedRootParent} (called from
 * `parent2()` in treeAlpha.ts). Stale entries (where the node was re-inserted then
 * removed again, getting a new DetachedField) are detected and replaced on access.
 */
const removedRootParentCache = new WeakMap<TreeNode, RemovedRootParent>();

export function getOrCreateRemovedRootParent(
	context: FlexTreeHydratedContext,
	detachedField: DetachedField,
	detachedNode: TreeNode,
): RemovedRootParent {
	const cached = removedRootParentCache.get(detachedNode);
	// If the node was re-inserted and removed again, it gets a new DetachedField,
	// so we need to replace the stale cached entry.
	if (cached?.getDetachedField() === detachedField) {
		return cached;
	}
	const detachedParent = new RemovedRootParent(context, detachedField, detachedNode);
	removedRootParentCache.set(detachedNode, detachedParent);
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

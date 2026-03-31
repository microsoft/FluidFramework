/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedBaseType } from "@fluidframework/core-interfaces/internal";
import { ErasedTypeImplementation } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { DetachedField } from "../core/index.js";
import type { FlexTreeHydratedContext } from "../feature-libraries/index.js";
import {
	type TreeNode,
	type TreeBranch,
	type UnhydratedFlexTreeNode,
	type TreeLeafValue,
	type TreeChangeEvents,
	type ImplicitFieldSchema,
	getKernel,
	treeNodeApi,
	isTreeNode,
} from "../simple-tree/index.js";

import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

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
 * Abstract base class for all {@link ParentObject} implementations.
 *
 * @remarks
 * This is the single implementation of {@link ErasedTypeImplementation} for {@link ParentObject},
 * satisfying the one-implementation-per-erased-type constraint. Concrete subclasses
 * ({@link DocumentRootParent}, {@link RemovedRootParent}, {@link UnhydratedParent})
 * extend this base and implement the abstract dispatch methods.
 */
export abstract class ParentObjectBase
	extends ErasedTypeImplementation<ParentObject>
	implements ParentObject
{
	/**
	 * Gets the child at the given key under this parent.
	 * @param propertyKey - Must be `undefined` for ParentObject parents.
	 * @returns The child node or leaf value, or `undefined` if no child exists.
	 */
	public abstract getChild(
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined;

	/**
	 * Gets all children of this parent, paired with their keys.
	 * @returns An iterable of `[key, child]` pairs. For ParentObject parents,
	 * returns a single child with key `undefined`, or empty if no child exists.
	 */
	public abstract getChildren(): Iterable<
		[propertyKey: string | number | undefined, child: TreeNode | TreeLeafValue]
	>;

	/**
	 * Subscribes to events on this parent.
	 * @param eventName - The event to listen for.
	 * @param listener - The callback to invoke when the event fires.
	 * @returns A function that removes the listener when called.
	 */
	public abstract subscribe<K extends keyof TreeChangeEvents>(
		eventName: K,
		listener: TreeChangeEvents[K],
	): () => void;
}

/**
 * Parent above the {@link TreeStatus.InDocument | InDocument} tree of the provided branch.
 *
 * @remarks
 * Subscribing to events on this parent proxies content events (`nodeChanged`/`treeChanged`)
 * to the current root node of the branch, and automatically re-subscribes when the root is replaced.
 * Root replacement itself fires only `treeChanged`, not `nodeChanged`.
 */
export class DocumentRootParent extends ParentObjectBase {
	private static readonly cache = new WeakMap<TreeBranch, DocumentRootParent>();

	private constructor(private readonly branch: TreeBranch) {
		super();
	}

	/**
	 * Gets or creates a cached DocumentRootParent for the given branch.
	 * @remarks
	 * Each TreeBranch has exactly one DocumentRootParent, ensuring that `parent2()` returns
	 * the same instance for all root nodes of the same branch.
	 */
	public static getOrCreate(branch: TreeBranch): DocumentRootParent {
		let rootParent = DocumentRootParent.cache.get(branch);
		if (rootParent === undefined) {
			rootParent = new DocumentRootParent(branch);
			DocumentRootParent.cache.set(branch, rootParent);
		}
		return rootParent;
	}

	/**
	 * Narrows the branch to {@link SchematizingSimpleTreeView} and asserts schema compatibility.
	 */
	private getViewableBranch(): SchematizingSimpleTreeView<ImplicitFieldSchema> {
		const branch = this.branch;
		assert(branch instanceof SchematizingSimpleTreeView, "Unexpected branch implementation");
		if (!branch.compatibility.canView) {
			throw new UsageError("Cannot access a DocumentRootParent with incompatible schema");
		}
		return branch;
	}

	public override getChild(
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined {
		if (propertyKey !== undefined) {
			return undefined;
		}
		const root = this.getViewableBranch().root;
		if (root === undefined || isTreeNode(root)) {
			return root;
		}
		return root as TreeLeafValue;
	}

	public override getChildren(): Iterable<
		[propertyKey: string | number | undefined, child: TreeNode | TreeLeafValue]
	> {
		const root = this.getViewableBranch().root;
		if (root === undefined) {
			return [];
		}
		return [[undefined, isTreeNode(root) ? root : (root as TreeLeafValue)]];
	}

	public override subscribe<K extends keyof TreeChangeEvents>(
		eventName: K,
		listener: TreeChangeEvents[K],
	): () => void {
		const branch = this.getViewableBranch();

		let isSubscribed = true;
		let currentNodeUnsubscribe: (() => void) | undefined;
		let lastRootNode: unknown;

		const subscribeToRoot = (): void => {
			if (!isSubscribed || !branch.compatibility.canView) {
				return;
			}

			const rootNode = branch.root;
			lastRootNode = rootNode;
			currentNodeUnsubscribe = isTreeNode(rootNode)
				? treeNodeApi.on(rootNode, eventName, listener)
				: undefined;
		};

		subscribeToRoot();

		// Note: "rootChanged" fires for any batch that touches the tree, not just
		// actual root replacements, so we track the root node identity ourselves.
		const unsubscribeRootChanged = branch.events.on("rootChanged", () => {
			const newRootNode = branch.compatibility.canView ? branch.root : undefined;
			if (newRootNode === lastRootNode) {
				return;
			}

			if (currentNodeUnsubscribe !== undefined) {
				currentNodeUnsubscribe();
				currentNodeUnsubscribe = undefined;
			}

			// Root replacement is a structural change, so fire for "treeChanged".
			// "nodeChanged" tracks property changes of whichever node is currently
			// at root, not root replacement itself.
			if (eventName === "treeChanged") {
				(listener as (...args: unknown[]) => void)();
			}

			subscribeToRoot();
		});

		return () => {
			isSubscribed = false;
			if (currentNodeUnsubscribe !== undefined) {
				currentNodeUnsubscribe();
				currentNodeUnsubscribe = undefined;
			}
			unsubscribeRootChanged();
		};
	}
}

/**
 * A location which contained (and might still contain) a {@link TreeStatus.Removed | Removed} root.
 *
 * @remarks
 * Invalidated when the node that was in this location is moved elsewhere (e.g., re-inserted
 * into the document or moved to a different detached field).
 *
 * Subscribing to events on this parent fires when the node's status transitions
 * (e.g., re-attached via undo). The listener fires after the batch completes,
 * ensuring the tree is in a consistent state.
 */
export class RemovedRootParent extends ParentObjectBase {
	/**
	 * Cache keyed by the detached TreeNode itself. A node can only be in one detached field
	 * at a time, so keying by node is sufficient. Using WeakMap ensures entries are
	 * cleaned up when the node is garbage collected.
	 *
	 * Entries are created/updated lazily by {@link RemovedRootParent.getOrCreate}.
	 * Stale entries (where the node was re-inserted then removed again, getting a new
	 * DetachedField) are detected and replaced on access.
	 */
	private static readonly cache = new WeakMap<TreeNode, RemovedRootParent>();

	private constructor(
		private readonly context: FlexTreeHydratedContext,
		private readonly detachedField: DetachedField,
		private readonly detachedNode: TreeNode,
	) {
		super();
	}

	/**
	 * Gets or creates a cached RemovedRootParent for the given detached node.
	 */
	public static getOrCreate(
		context: FlexTreeHydratedContext,
		detachedField: DetachedField,
		detachedNode: TreeNode,
	): RemovedRootParent {
		const cached = RemovedRootParent.cache.get(detachedNode);
		// If the node was re-inserted and removed again, it gets a new DetachedField,
		// so we need to replace the stale cached entry.
		if (cached?.detachedField === detachedField) {
			return cached;
		}
		const parent = new RemovedRootParent(context, detachedField, detachedNode);
		RemovedRootParent.cache.set(detachedNode, parent);
		return parent;
	}

	public override getChild(
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined {
		if (propertyKey !== undefined) {
			return undefined;
		}
		return this.detachedNode;
	}

	public override getChildren(): Iterable<
		[propertyKey: string | number | undefined, child: TreeNode | TreeLeafValue]
	> {
		return [[undefined, this.detachedNode]];
	}

	public override subscribe<K extends keyof TreeChangeEvents>(
		_eventName: K,
		listener: TreeChangeEvents[K],
	): () => void {
		const kernel = getKernel(this.detachedNode);

		// Sync the kernel's last known status to the current state before subscribing.
		kernel.checkAndEmitStatusChange();

		// Subscribe to afterBatch to check for status changes after any tree modification.
		let unsubscribeAfterBatch: (() => void) | undefined = this.context.checkout.events.on(
			"afterBatch",
			() => {
				kernel.checkAndEmitStatusChange();
			},
		);

		const unsubscribeStatus = kernel.statusEvents.on("statusChanged", () => {
			// Once a status transition is detected, stop polling afterBatch.
			if (unsubscribeAfterBatch !== undefined) {
				unsubscribeAfterBatch();
				unsubscribeAfterBatch = undefined;
			}
			(listener as (...args: unknown[]) => void)();
		});

		return () => {
			unsubscribeStatus();
			if (unsubscribeAfterBatch !== undefined) {
				unsubscribeAfterBatch();
				unsubscribeAfterBatch = undefined;
			}
		};
	}
}

/**
 * Parent of an {@link Unhydrated} root node that has not yet been inserted into any document.
 *
 * @remarks
 * Subscribing to events on this parent fires once when the node is hydrated
 * (inserted into a document for the first time), then auto-unsubscribes.
 * Further status transitions are handled by {@link RemovedRootParent} or
 * {@link DocumentRootParent}.
 */
export class UnhydratedParent extends ParentObjectBase {
	private static readonly cache = new WeakMap<UnhydratedFlexTreeNode, UnhydratedParent>();

	private constructor(private readonly unhydratedRoot: UnhydratedFlexTreeNode) {
		super();
	}

	/**
	 * Gets or creates a cached UnhydratedParent for the given unhydrated node.
	 * @remarks
	 * Using WeakMap ensures entries are cleaned up when the unhydrated node is
	 * garbage collected (e.g., after hydration when no external references remain).
	 */
	public static getOrCreate(unhydratedRoot: UnhydratedFlexTreeNode): UnhydratedParent {
		let parent = UnhydratedParent.cache.get(unhydratedRoot);
		if (parent === undefined) {
			parent = new UnhydratedParent(unhydratedRoot);
			UnhydratedParent.cache.set(unhydratedRoot, parent);
		}
		return parent;
	}

	/**
	 * Gets the TreeNode for this unhydrated root.
	 * @remarks
	 * Always defined because UnhydratedParent instances are only created by `parent2()`,
	 * which requires a TreeNode argument whose kernel sets the inner node's treeNode field.
	 */
	private getTreeNode(): TreeNode {
		const treeNode = this.unhydratedRoot.treeNode;
		assert(treeNode !== undefined, "Expected treeNode to be set on UnhydratedFlexTreeNode");
		return treeNode;
	}

	public override getChild(
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined {
		if (propertyKey !== undefined) {
			return undefined;
		}
		return this.getTreeNode();
	}

	public override getChildren(): Iterable<
		[propertyKey: string | number | undefined, child: TreeNode | TreeLeafValue]
	> {
		return [[undefined, this.getTreeNode()]];
	}

	public override subscribe<K extends keyof TreeChangeEvents>(
		_eventName: K,
		listener: TreeChangeEvents[K],
	): () => void {
		const kernel = getKernel(this.getTreeNode());

		// One-shot subscription: auto-unsubscribes after first status change.
		let unsubscribe: (() => void) | undefined;
		unsubscribe = kernel.statusEvents.on("statusChanged", () => {
			unsubscribe?.();
			unsubscribe = undefined;
			(listener as (...args: unknown[]) => void)();
		});
		return () => {
			unsubscribe?.();
			unsubscribe = undefined;
		};
	}
}

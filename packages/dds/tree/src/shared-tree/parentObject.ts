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
 * {@link (TreeAlpha:interface).children}, and `TreeAlpha.on`.
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
 * When this is a {@link TreeNode}, then the node has a regular parent node in the tree hierarchy.
 * When this is a {@link ParentObject}, then the node has no `TreeNode` parent (e.g., it is a root node,
 * it was removed from the tree, or it is newly created and not yet inserted).
 *
 * @alpha
 */
export type TreeNodeParent = TreeNode | ParentObject;

/**
 * Abstract base class for all {@link ParentObject} implementations.
 *
 * @privateRemarks
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
	 * @param propertyKey - The property key under this parent for which the child is being requested.
	 * A {@link ParentObject} holds at most a single child (the root/detached/unhydrated node), which is
	 * keyed by `undefined`. Must be `undefined`: passing any other key is an error.
	 * @returns The child node or leaf value, or `undefined` if no child currently exists at that location.
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
	/**
	 * Cache keyed by the {@link TreeBranch} this is the document root parent of.
	 * @remarks
	 * Each branch has exactly one {@link DocumentRootParent}, so caching here ensures that
	 * {@link (TreeAlpha:interface).parent2} returns the same instance for all root nodes of the same branch.
	 * Using a {@link WeakMap} ensures entries are cleaned up when the branch is garbage collected.
	 */
	private static readonly cache = new WeakMap<TreeBranch, DocumentRootParent>();

	private constructor(
		private readonly branch: SchematizingSimpleTreeView<ImplicitFieldSchema>,
	) {
		super();
	}

	/**
	 * Gets or creates a cached {@link DocumentRootParent} for the given branch.
	 * @remarks
	 * Each {@link TreeBranch} has exactly one {@link DocumentRootParent}, ensuring that
	 * {@link (TreeAlpha:interface).parent2} returns the same instance for all root nodes of the same branch.
	 * @param branch - The branch whose document root parent is being requested. Must be a
	 * {@link SchematizingSimpleTreeView}, which is the only implementation of {@link TreeBranch}.
	 */
	public static getOrCreate(branch: TreeBranch): DocumentRootParent {
		// Validate (and narrow) the branch type up front so failures surface here, at creation,
		// rather than on later access, and so subsequent access does not have to re-check.
		assert(branch instanceof SchematizingSimpleTreeView, "Unexpected branch implementation");
		// instanceof loses the generic parameter; the cast restores it. This is safe because
		// TreeBranch is always created as SchematizingSimpleTreeView<ImplicitFieldSchema>.
		const viewableBranch = branch as SchematizingSimpleTreeView<ImplicitFieldSchema>;
		let rootParent = DocumentRootParent.cache.get(branch);
		if (rootParent === undefined) {
			rootParent = new DocumentRootParent(viewableBranch);
			DocumentRootParent.cache.set(branch, rootParent);
		}
		return rootParent;
	}

	/**
	 * Returns the branch, asserting it is currently viewable (schema compatible).
	 */
	private getViewableBranch(): SchematizingSimpleTreeView<ImplicitFieldSchema> {
		if (!this.branch.compatibility.canView) {
			throw new UsageError("Cannot access a DocumentRootParent with incompatible schema");
		}
		return this.branch;
	}

	public override getChild(
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined {
		assert(propertyKey === undefined, "Children of a ParentObject are keyed by undefined");
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
		// `root` is `undefined` when the document's optional root field currently holds no value:
		// either it was never set, or it was cleared after this parent object was created (recall that
		// this parent is a location, not a node, so it outlives the node that was at the root).
		// An empty location has no child, so we return an empty iterable.
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

		// Whether this subscription is still active (cleared by the returned unsubscribe function).
		let isSubscribed = true;
		// Unsubscribe handle for the listener currently attached to the root node (if the root is a TreeNode).
		let currentNodeUnsubscribe: (() => void) | undefined;
		// The root node identity we last subscribed to, used to detect actual root replacements.
		let lastRootNode: unknown;

		const subscribeToRoot = (): void => {
			// Skip (re-)subscribing if the caller has already unsubscribed (this is also invoked from the
			// "rootChanged" handler below), or if the branch's schema is not currently viewable, in which
			// case `branch.root` cannot be safely accessed.
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
	 * Cache keyed by the detached {@link TreeNode} itself. A node can only be in one detached field
	 * at a time, so keying by node is sufficient. Using {@link WeakMap} ensures entries are
	 * cleaned up when the node is garbage collected.
	 *
	 * Entries are created/updated lazily by {@link RemovedRootParent.getOrCreate}.
	 * Stale entries (where the node was re-inserted then removed again, getting a new
	 * {@link DetachedField}) are detected and replaced on access.
	 */
	private static readonly cache = new WeakMap<TreeNode, RemovedRootParent>();

	private constructor(
		/**
		 * The hydrated context (checkout) that the detached field belongs to.
		 * @remarks
		 * Used to subscribe to `afterBatch` so status transitions are observed only after the tree is consistent.
		 */
		private readonly context: FlexTreeHydratedContext,
		/**
		 * The detached field this node was in when this parent object was created.
		 * @remarks
		 * Used to detect stale cache entries: if the node is later re-inserted and removed again it gets a
		 * new detached field, which no longer matches this one.
		 */
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
	 * Gets or creates a cached {@link RemovedRootParent} for the given detached node.
	 * @param context - The hydrated context (checkout) the detached field belongs to.
	 * @param detachedField - The detached field the node currently resides in.
	 * @param detachedNode - The removed node this parent object represents the location of.
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
		assert(propertyKey === undefined, "Children of a ParentObject are keyed by undefined");
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
		assert(propertyKey === undefined, "Children of a ParentObject are keyed by undefined");
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedBaseType } from "@fluidframework/core-interfaces/internal";
import { ErasedTypeImplementation } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { DetachedField } from "../core/index.js";
import {
	type TreeNode,
	type TreeBranch,
	type UnhydratedFlexTreeNode,
	type TreeLeafValue,
	type TreeChangeEventsBeta,
	type ImplicitFieldSchema,
	getKernel,
	treeNodeApi,
	isTreeNode,
	isBufferingTreeEvents,
	onTreeEventsFlush,
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
 * This object can be passed to {@link (TreeAlpha:interface).(child:1)},
 * {@link (TreeAlpha:interface).(children:1)}, and `TreeAlpha.on`.
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
 * Events that can be subscribed to on a {@link ParentObject} via `TreeAlpha.on`.
 *
 * @remarks
 * A {@link ParentObject} exposes the same change events as a {@link TreeNode}, so callers do not have
 * to reason about whether the value returned by {@link (TreeAlpha:interface).parent2} is a node or a
 * parent object. It is modeled like a node whose single child is the root/detached/unhydrated node it
 * is the parent of:
 *
 * - `nodeChanged` fires when the child occupying this location changes (the occupant is replaced,
 * attached, or detached) — the shallow change to this location's single child, analogous to a change
 * to a direct property of a node.
 *
 * - `treeChanged` fires whenever anything changes in the subtree at this location — both changes to
 * the content of the current child and replacement of the child itself.
 *
 * Which events fire depends on the kind of {@link ParentObject}:
 *
 * - For document-root parents, `nodeChanged` fires when the root is replaced (including to/from a leaf
 * or empty), and `treeChanged` proxies to the current root node (and also fires when the root is
 * replaced).
 *
 * - For removed-root and unhydrated parents, both `nodeChanged` and `treeChanged` fire when the node is
 * re-attached or hydrated, leaving the location empty; there is no in-place content to report.
 *
 * @privateRemarks
 * The event signatures are reused from {@link TreeChangeEventsBeta} (rather than the plain
 * {@link TreeChangeEvents}) so that a listener written against these alpha events can be substituted up
 * the `alpha -> beta -> public` event stack. Because a `ParentObject` is a location without schema, its
 * `nodeChanged` never reports {@link NodeChangedData.changedProperties}.
 *
 * @sealed
 * @alpha
 */
export interface ParentObjectEvents
	extends Pick<TreeChangeEventsBeta, "nodeChanged" | "treeChanged"> {}

/**
 * Builds a no-argument callback that delivers a {@link ParentObject}'s occupancy change to the given
 * `nodeChanged`/`treeChanged` listener.
 *
 * @remarks
 * `nodeChanged` carries a data payload; since a {@link ParentObject} is a location without schema, it is
 * delivered with an empty payload (no {@link NodeChangedData.changedProperties}). `treeChanged` takes no
 * argument. This lets both events flow through the no-argument {@link NotifyCoalescer}.
 */
function makeOccupancyNotifier<K extends keyof ParentObjectEvents>(
	eventName: K,
	listener: ParentObjectEvents[K],
): () => void {
	return eventName === "nodeChanged"
		? () => (listener as ParentObjectEvents["nodeChanged"])({})
		: (listener as ParentObjectEvents["treeChanged"]);
}

/**
 * Coalesces a no-argument notification (e.g. {@link ParentObjectEvents.nodeChanged} or
 * {@link ParentObjectEvents.treeChanged} fired for a root replacement) so that, inside a
 * {@link withBufferedTreeEvents} window, it fires at most once at the end of the window. Delivers
 * immediately when no window is active.
 */
class NotifyCoalescer {
	#pending = false;
	#flushScheduled = false;
	#active = true;

	public constructor(private readonly listener: () => void) {}

	public fire(): void {
		if (!this.#active) {
			return;
		}
		if (!isBufferingTreeEvents()) {
			this.listener();
			return;
		}
		this.#pending = true;
		if (!this.#flushScheduled) {
			this.#flushScheduled = true;
			onTreeEventsFlush(() => this.#flush());
		}
	}

	#flush(): void {
		this.#flushScheduled = false;
		if (this.#active && this.#pending) {
			this.#pending = false;
			this.listener();
		}
	}

	public dispose(): void {
		this.#active = false;
		this.#pending = false;
	}
}

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
	 * keyed by `undefined`.
	 * @returns The child node or leaf value keyed by `undefined`, or `undefined` if no child currently
	 * exists at that location. Any `propertyKey` other than `undefined` also returns `undefined`, since a
	 * `ParentObject` has no children under any other key.
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
	public abstract subscribe<K extends keyof ParentObjectEvents>(
		eventName: K,
		listener: ParentObjectEvents[K],
	): () => void;
}

/**
 * Parent above the {@link TreeStatus.InDocument | InDocument} tree of the provided branch.
 *
 * @remarks
 * Subscribing to `treeChanged` fires whenever anything changes in the document: it proxies to the
 * current root node's `treeChanged` (deep content changes) and also fires when the root is replaced.
 * The subscription automatically re-subscribes to the new root when the root is replaced.
 *
 * Subscribing to `nodeChanged` fires only when the root is replaced (including changes to/from a leaf
 * value or an empty root) — the shallow change to this location's single child.
 */
export class DocumentRootParent extends ParentObjectBase {
	/**
	 * Cache of {@link DocumentRootParent}s keyed by the {@link TreeBranch} for which they are the document root parent.
	 * @remarks
	 * Caching a single instance per branch ensures that {@link (TreeAlpha:interface).parent2} returns
	 * that same instance whenever it is called for a root node of that branch.
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
	 * A single {@link DocumentRootParent} instance is cached per branch, so that
	 * {@link (TreeAlpha:interface).parent2} returns that same instance whenever it is called for a
	 * root node of that branch.
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
	 * Returns the branch, asserting it is currently compatible with the view schema.
	 */
	private getViewableBranch(): SchematizingSimpleTreeView<ImplicitFieldSchema> {
		if (!this.branch.compatibility.canView) {
			throw new UsageError(
				"Cannot access a DocumentRootParent whose schema is incompatible with the view schema",
			);
		}
		return this.branch;
	}

	public override getChild(
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined {
		// A ParentObject's only child is keyed by `undefined`; any other key has no child.
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
		// `root` is `undefined` when the document's optional root field currently holds no value:
		// either it was never set, or it was cleared after this parent object was created (recall that
		// this parent is a location, not a node, so it outlives the node that was at the root).
		// An empty location has no child, so we return an empty iterable.
		if (root === undefined) {
			return [];
		}
		return [[undefined, isTreeNode(root) ? root : (root as TreeLeafValue)]];
	}

	public override subscribe<K extends keyof ParentObjectEvents>(
		eventName: K,
		listener: ParentObjectEvents[K],
	): () => void {
		const branch = this.getViewableBranch();

		// Reads the current root value (node, leaf, or undefined), or `undefined` if the schema is
		// not currently viewable (in which case `branch.root` cannot be safely accessed).
		const readRoot = (): TreeNode | TreeLeafValue | undefined =>
			branch.compatibility.canView ? branch.root : undefined;

		// Whether this subscription is still active (cleared by the returned unsubscribe function).
		let isSubscribed = true;
		// Unsubscribe handle for the listener currently attached to the root node (if the root is a TreeNode).
		let currentNodeUnsubscribe: (() => void) | undefined;
		// The root value we last observed, used to detect actual root replacements.
		let lastRoot: TreeNode | TreeLeafValue | undefined;

		// Coalescers so that root-replacement notifications fired below participate in
		// `withBufferedTreeEvents` windows (matching how content events are coalesced).
		const nodeChangedCoalescer =
			eventName === "nodeChanged"
				? new NotifyCoalescer(makeOccupancyNotifier(eventName, listener))
				: undefined;
		const treeChangedCoalescer =
			eventName === "treeChanged"
				? new NotifyCoalescer(listener as ParentObjectEvents["treeChanged"])
				: undefined;

		const subscribeToRoot = (): void => {
			// Skip (re-)subscribing if the caller has already unsubscribed (this is also invoked from the
			// "rootChanged" handler below), or if the branch's schema is not currently viewable.
			if (!isSubscribed || !branch.compatibility.canView) {
				return;
			}

			const rootNode = branch.root;
			lastRoot = rootNode;
			// Only `treeChanged` proxies to the current root node (for its deep content changes).
			// `nodeChanged` reports occupancy changes of the location itself, and root replacement for
			// `treeChanged` is both handled in the "rootChanged" listener below.
			currentNodeUnsubscribe =
				eventName === "treeChanged" && isTreeNode(rootNode)
					? treeNodeApi.on(
							rootNode,
							"treeChanged",
							listener as ParentObjectEvents["treeChanged"],
						)
					: undefined;
		};

		subscribeToRoot();

		// Note: "rootChanged" fires for any batch that touches the tree, not just
		// actual root replacements, so we track the root value ourselves.
		const unsubscribeRootChanged = branch.events.on("rootChanged", () => {
			const newRoot = readRoot();
			if (newRoot === lastRoot) {
				return;
			}

			if (currentNodeUnsubscribe !== undefined) {
				currentNodeUnsubscribe();
				currentNodeUnsubscribe = undefined;
			}

			// Root replacement is a change within this location's subtree AND a shallow (occupancy) change:
			// - `treeChanged` fires because something in the tree changed (the root was replaced).
			// - `nodeChanged` fires because this location's single child changed.
			// Both are routed through coalescers so they merge within a `withBufferedTreeEvents` window.
			treeChangedCoalescer?.fire();
			nodeChangedCoalescer?.fire();

			subscribeToRoot();
		});

		return () => {
			isSubscribed = false;
			treeChangedCoalescer?.dispose();
			nodeChangedCoalescer?.dispose();
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
 * Subscribing to `nodeChanged` or `treeChanged` fires when the node's status transitions
 * (e.g., re-attached via undo), leaving this location empty. The listener fires after the batch
 * completes, ensuring the tree is in a consistent state.
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
	 * @param detachedField - The detached field the node currently resides in.
	 * @param detachedNode - The removed node this parent object represents the location of.
	 */
	public static getOrCreate(
		detachedField: DetachedField,
		detachedNode: TreeNode,
	): RemovedRootParent {
		const cached = RemovedRootParent.cache.get(detachedNode);
		// If the node was re-inserted and removed again, it gets a new DetachedField,
		// so we need to replace the stale cached entry.
		if (cached?.detachedField === detachedField) {
			return cached;
		}
		const parent = new RemovedRootParent(detachedField, detachedNode);
		RemovedRootParent.cache.set(detachedNode, parent);
		return parent;
	}

	public override getChild(
		propertyKey: string | number | undefined,
	): TreeNode | TreeLeafValue | undefined {
		// A ParentObject's only child is keyed by `undefined`; any other key has no child.
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

	public override subscribe<K extends keyof ParentObjectEvents>(
		eventName: K,
		listener: ParentObjectEvents[K],
	): () => void {
		// A removed-root location reports the occupant leaving via both `nodeChanged` (the shallow
		// change to its single child) and `treeChanged` (a change within its subtree). Both fire from
		// the same transition; any other event name is a no-op.
		if (eventName !== "nodeChanged" && eventName !== "treeChanged") {
			return () => {};
		}
		const kernel = getKernel(this.detachedNode);
		const coalescer = new NotifyCoalescer(makeOccupancyNotifier(eventName, listener));

		// The kernel's batch-aligned `statusChangedAfterBatch` fires after the batch settles, so the tree
		// is consistent when the listener runs. It also owns the `afterBatch` polling needed to detect the
		// detach → re-attach transition, so no per-consumer afterBatch subscription is required here.
		const unsubscribeStatus = kernel.statusEvents.on("statusChangedAfterBatch", () => {
			// The transition is one-shot for this location: once the node leaves, stop listening.
			unsubscribeStatus();
			// The node left this location (e.g., re-attached into the document), leaving it empty.
			coalescer.fire();
		});

		return () => {
			coalescer.dispose();
			unsubscribeStatus();
		};
	}
}

/**
 * Parent of an {@link Unhydrated} root node that has not yet been inserted into any document.
 *
 * @remarks
 * Subscribing to `nodeChanged` or `treeChanged` fires once when the node is hydrated
 * (inserted into a document for the first time), leaving this location empty, then auto-unsubscribes.
 * Further transitions are reported by {@link RemovedRootParent} or {@link DocumentRootParent}.
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
		// A ParentObject's only child is keyed by `undefined`; any other key has no child.
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

	public override subscribe<K extends keyof ParentObjectEvents>(
		eventName: K,
		listener: ParentObjectEvents[K],
	): () => void {
		// An unhydrated-root location reports the occupant leaving (on hydration) via both `nodeChanged`
		// (the shallow change to its single child) and `treeChanged` (a change within its subtree). Both
		// fire from the same transition; any other event name is a no-op.
		if (eventName !== "nodeChanged" && eventName !== "treeChanged") {
			return () => {};
		}
		const node = this.getTreeNode();
		const kernel = getKernel(node);
		const coalescer = new NotifyCoalescer(makeOccupancyNotifier(eventName, listener));

		// The kernel's batch-aligned `statusChangedAfterBatch` handles deferral to `afterBatch` internally
		// (whether hydration occurs mid-batch, e.g. `insertAtEnd`, or after the tree has already settled,
		// e.g. `view.initialize()`), so the listener always observes a consistent `Tree.status()`.
		const unsubscribeStatus = kernel.statusEvents.on("statusChangedAfterBatch", () => {
			// One-shot: hydration is a single New -> InDocument transition for this location.
			unsubscribeStatus();
			// The node was hydrated into the document, leaving this unhydrated location empty.
			coalescer.fire();
		});
		return () => {
			coalescer.dispose();
			unsubscribeStatus();
		};
	}
}

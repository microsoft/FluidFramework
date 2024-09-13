/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	createEmitter,
	type HasListeners,
	type IEmitter,
	type Listenable,
	type Off,
} from "../../events/index.js";
import type { TreeNode, Unhydrated } from "./types.js";
import {
	anchorSlot,
	type AnchorEvents,
	type AnchorNode,
	type AnchorSet,
	type UpPath,
} from "../../core/index.js";
import {
	assertFlexTreeEntityNotFreed,
	ContextSlot,
	flexTreeSlot,
	isFlexTreeNode,
	isFreedSymbol,
	isMapTreeNode,
	LazyEntity,
	TreeStatus,
	treeStatusFromAnchorCache,
	type FlexTreeNode,
	type MapTreeNode,
} from "../../feature-libraries/index.js";
import type { TreeNodeSchema } from "./treeNodeSchema.js";
import { fail } from "../../util/index.js";
// TODO: decide how to deal with dependencies on flex-tree implementation.
// eslint-disable-next-line import/no-internal-modules
import { makeTree } from "../../feature-libraries/flex-tree/lazyNode.js";

const treeNodeToKernel = new WeakMap<TreeNode, TreeNodeKernel>();

export function getKernel(node: TreeNode): TreeNodeKernel {
	const kernel = treeNodeToKernel.get(node);
	assert(kernel !== undefined, 0x9b1 /* Expected tree node to have kernel */);
	return kernel;
}

/**
 * Detects if the given 'candidate' is a TreeNode.
 *
 * @remarks
 * Supports both Hydrated and {@link Unhydrated} TreeNodes, both of which return true.
 *
 * Because the common usage is to check if a value being inserted/set is a TreeNode,
 * this function permits calling with primitives as well as objects.
 *
 * Primitives will always return false (as they are copies of data, not references to nodes).
 *
 * @param candidate - Value which may be a TreeNode
 * @returns true if the given 'candidate' is a hydrated TreeNode.
 */
export function isTreeNode(candidate: unknown): candidate is TreeNode | Unhydrated<TreeNode> {
	return treeNodeToKernel.has(candidate as TreeNode);
}

/**
 * Returns a schema for a value if the value is a {@link TreeNode}.
 *
 * Returns undefined for other values.
 * @remarks
 * Does not give schema for a {@link TreeLeafValue}.
 */
export function tryGetTreeNodeSchema(value: unknown): undefined | TreeNodeSchema {
	const kernel = treeNodeToKernel.get(value as TreeNode);
	return kernel?.schema;
}

/**
 * Contains state and an internal API for managing {@link TreeNode}s.
 * @remarks All {@link TreeNode}s have an associated kernel object.
 * The kernel has the same lifetime as the node and spans both its unhydrated and hydrated states.
 * When hydration occurs, the kernel is notified via the {@link TreeNodeKernel.hydrate | hydrate} method.
 */
export class TreeNodeKernel implements Listenable<KernelEvents> {
	private disposed = false;

	/**
	 * Generation number which is incremented any time we have an edit on the node.
	 * Used during iteration to make sure there has been no edits that were concurrently made.
	 * @remarks
	 * This is updated monotonically by this class when edits are applied.
	 * TODO: update this when applying edits to unhydrated trees.
	 *
	 * If TypeScript supported making this immutable from outside the class without making it readonly from inside, that would be used here,
	 * but they only way to do that is add a separate public accessor and make it private, which was deemed not worth the boilerplate, runtime overhead and bundle size.
	 */
	public generationNumber: number = 0;

	#hydrated?: {
		anchorNode: AnchorNode;
		offAnchorNode: Set<Off>;
	};

	/**
	 * Events registered before hydration.
	 * @remarks
	 * As an optimization these are allocated lazily as they are usually unused.
	 */
	#preHydrationEvents?: Listenable<KernelEvents> &
		IEmitter<KernelEvents> &
		HasListeners<KernelEvents>;

	/**
	 * Get the listener.
	 * @remarks
	 * If before hydration, allocates and uses `#preHydrationEvents`, otherwise the anchorNode.
	 * This design avoids allocating `#preHydrationEvents` if unneeded.
	 *
	 * This design also avoids extra forwarding overhead for events from anchorNode and also
	 * avoids registering for events that are unneeded.
	 * This means optimizations like skipping processing data in subtrees where no subtreeChanged events are subscribed to would be able to work,
	 * since this code does not unconditionally subscribe to those events (like a design simply forwarding all events would).
	 */
	get #events(): Listenable<KernelEvents> {
		if (this.#hydrated === undefined) {
			this.#preHydrationEvents ??= createEmitter<KernelEvents>();
			return this.#preHydrationEvents;
		} else {
			return this.#hydrated.anchorNode;
		}
	}

	/**
	 * Create a TreeNodeKernel which can be looked up with {@link getKernel}.
	 *
	 * @param innerNode - When unhydrated/raw or marinated the MapTreeNode. FlexTreeNode when cooked.
	 * @remarks
	 * Exactly one kernel per TreeNode should be created.
	 */
	public constructor(
		public readonly node: TreeNode,
		public readonly schema: TreeNodeSchema,
		private innerNode: InnerNode,
	) {
		assert(!treeNodeToKernel.has(node), 0xa1a /* only one kernel per node can be made */);
		treeNodeToKernel.set(node, this);

		if (isMapTreeNode(innerNode)) {
			// Unhydrated case
			mapTreeNodeToProxy.set(innerNode, node);
		} else {
			// Hydrated case
			assert(
				!innerNode.anchorNode.slots.has(proxySlot),
				0x7f5 /* Cannot associate an flex node with multiple simple-tree nodes */,
			);
			this.hydrate(innerNode.anchorNode);
		}
	}

	/**
	 * Transition from {@link Unhydrated} to hydrated.
	 * Bi-directionally associates the given hydrated TreeNode to the given anchor node.
	 * @remarks
	 * Happens at most once for any given node.
	 * Cleans up mappings to {@link MapTreeNode} - it is assumed that they are no longer needed once the proxy has an anchor node.
	 */
	public hydrate(anchorNode: AnchorNode): void {
		assert(!this.disposed, 0xa2a /* cannot hydrate a disposed node */);
		assert(this.#hydrated === undefined, 0xa2b /* hydration should only happen once */);

		// If the this node is raw and thus has a MapTreeNode, forget it:
		if (isMapTreeNode(this.innerNode)) {
			mapTreeNodeToProxy.delete(this.innerNode);
		}

		// However, it's fine for an anchor node to rotate through different proxies when the content at that place in the tree is replaced.
		anchorNode.slots.set(proxySlot, this.node);

		this.#hydrated = {
			anchorNode,
			offAnchorNode: new Set([
				anchorNode.on("afterDestroy", () => this.dispose()),
				// TODO: this should be triggered on change even for unhydrated nodes.
				anchorNode.on("childrenChanging", () => {
					this.generationNumber += 1;
				}),
			]),
		};

		// If needed, register forwarding emitters for events from before hydration
		if (this.#preHydrationEvents !== undefined) {
			for (const eventName of kernelEvents) {
				if (this.#preHydrationEvents.hasListeners(eventName)) {
					this.#hydrated.offAnchorNode.add(
						// Argument is forwarded between matching events, so the type should be correct.
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						anchorNode.on(eventName, (arg: any) =>
							this.#preHydrationEvents?.emit(eventName, arg),
						),
					);
				}
			}
		}
	}

	public isHydrated(): boolean {
		assert(!this.disposed, 0xa2c /* cannot use a disposed node */);
		return this.#hydrated !== undefined;
	}

	public getStatus(): TreeStatus {
		if (this.disposed) {
			return TreeStatus.Deleted;
		}
		if (this.#hydrated?.anchorNode === undefined) {
			return TreeStatus.New;
		}

		// TODO: Replace this check with the proper check against the cursor state when the cursor becomes part of the kernel
		const flex = this.#hydrated.anchorNode.slots.get(flexTreeSlot);
		if (flex !== undefined) {
			assert(flex instanceof LazyEntity, 0x9b4 /* Unexpected flex node implementation */);
			if (flex[isFreedSymbol]()) {
				return TreeStatus.Deleted;
			}
		}

		return treeStatusFromAnchorCache(this.#hydrated.anchorNode);
	}

	public on<K extends keyof KernelEvents>(eventName: K, listener: KernelEvents[K]): Off {
		return this.#events.on(eventName, listener);
	}

	public dispose(): void {
		this.disposed = true;
		for (const off of this.#hydrated?.offAnchorNode ?? []) {
			off();
		}
		// TODO: go to the context and remove myself from withAnchors
	}

	/**
	 * Retrieves the flex node associated with the given target via {@link setInnerNode}.
	 * @remarks
	 * For {@link Unhydrated} nodes, this returns the MapTreeNode.
	 *
	 * For hydrated nodes it returns a FlexTreeNode backed by the forest.
	 * Note that for "marinated" nodes, this FlexTreeNode exists and returns it: it does not return the MapTreeNode which is the current InnerNode.
	 */
	public getOrCreateInnerNode(allowFreed = false): InnerNode {
		if (!isMapTreeNode(this.innerNode)) {
			// Cooked case
			return this.innerNode;
		}

		if (this.#hydrated === undefined) {
			// Unhydrated case
			return this.innerNode;
		}

		// Marinated case -> cooked
		const anchorNode = this.#hydrated.anchorNode;
		// The proxy is bound to an anchor node, but it may or may not have an actual flex node yet
		const flexNode = anchorNode.slots.get(flexTreeSlot);
		if (flexNode !== undefined) {
			this.innerNode = flexNode;
			return flexNode; // If it does have a flex node, return it...
		} // ...otherwise, the flex node must be created
		const context = anchorNode.anchorSet.slots.get(ContextSlot) ?? fail("missing context");
		const cursor = context.checkout.forest.allocateCursor("getFlexNode");
		context.checkout.forest.moveCursorToPath(anchorNode, cursor);
		const newFlexNode = makeTree(context, cursor);
		cursor.free();
		this.innerNode = newFlexNode;
		// Calling this is a performance improvement, however, do this only after demand to avoid momentarily having no anchors to anchorNode
		anchorForgetters?.get(this.node)?.();
		if (!allowFreed) {
			assertFlexTreeEntityNotFreed(newFlexNode);
		}
		return newFlexNode;
	}

	/**
	 * Creates an anchor node and associates it with the given proxy.
	 * @privateRemarks
	 * Use `forgetters` to cleanup the anchor allocated by this function once the anchor is no longer needed.
	 * In practice, this happens when either the anchor node is destroyed, or another anchor to the same node is created by a new flex node.
	 *
	 * The FlexTreeNode holds a reference to the same anchor, and has a lifetime at least as long as the simple-tree,
	 * so this would be unnecessary except for the case of "marinated" nodes, which have an anchor,
	 * but might not have a FlexTreeNode.
	 * Handling this case is an optimization assuming that this extra anchor reference is cheaper than eagerly creating FlexTreeNodes.
	 */
	public anchorProxy(anchors: AnchorSet, path: UpPath): AnchorNode {
		assert(!anchorForgetters.has(this.node), 0x91c /* Proxy anchor should not be set twice */);
		const anchor = anchors.track(path);
		const anchorNode = anchors.locate(anchor) ?? fail("Expected anchor node to be present");
		this.hydrate(anchorNode);
		const forget = (): void => {
			if (anchors.locate(anchor)) {
				anchors.forget(anchor);
			}
			anchorForgetters.delete(this.node);
			off();
		};
		anchorForgetters.set(this.node, forget);
		const off = anchorNode.on("afterDestroy", forget);
		return anchorNode;
	}

	/**
	 * Retrieves the InnerNode associated with the given target via {@link setInnerNode}, if any.
	 * @remarks
	 * If `target` is a unhydrated node, returns its MapTreeNode.
	 * If `target` is a cooked node (or marinated but a FlexTreeNode exists) returns the FlexTreeNode.
	 * If the target is not a node, or a marinated node with no FlexTreeNode for its anchor, returns undefined.
	 */
	public tryGetInnerNode(): InnerNode | undefined {
		if (isFlexTreeNode(this.innerNode)) {
			// Cooked case
			return this.innerNode;
		}

		if (this.#hydrated === undefined) {
			// Unhydrated case
			return this.innerNode;
		}

		// Marinated case -> cooked
		const anchorNode = this.#hydrated.anchorNode;
		// The proxy is bound to an anchor node, but it may or may not have an actual flex node yet
		return anchorNode.slots.get(flexTreeSlot);
	}
}

/**
 * Used by {@link anchorProxy} as an optimization to ensure that only one anchor is remembered at a time for a given anchor node
 */
const anchorForgetters = new WeakMap<TreeNode, () => void>();

const kernelEvents = ["childrenChangedAfterBatch", "subtreeChangedAfterBatch"] as const;

type KernelEvents = Pick<AnchorEvents, (typeof kernelEvents)[number]>;

/**
 * For "cooked" nodes this is a FlexTreeNode thats a projection of forest content.
 * For {@link Unhydrated} nodes this is a MapTreeNode.
 * For "marinated" nodes, some code (ex: getOrCreateInnerNode) returns the FlexTreeNode thats a projection of forest content, and some code (ex: tryGetInnerNode) returns undefined.
 *
 * @remarks
 * Currently MapTreeNode extends FlexTreeNode, and most code which can work with either just uses FlexTreeNode.
 * TODO: Code should be migrating toward using this type to distinguish to two use-cases.
 *
 * TODO: The inconsistent handling of "marinated" cases should be cleaned up.
 * Maybe getOrCreateInnerNode should cook marinated nodes so they have a proper InnerNode?
 */
export type InnerNode = FlexTreeNode | MapTreeNode;

/**
 * {@inheritdoc proxyToMapTreeNode}
 */
const mapTreeNodeToProxy = new WeakMap<MapTreeNode, TreeNode>();

/**
 * An anchor slot which associates an anchor with its corresponding TreeNode, if there is one.
 * @remarks
 * For this to work, we have to require that there is at most a single view using a given AnchorSet.
 * FlexTree already has this assumption, and we also assume there is a single simple-tree per FlexTree, so this is valid.
 */
const proxySlot = anchorSlot<TreeNode>();

/**
 * Retrieves the proxy associated with the given flex node via {@link setInnerNode}, if any.
 */
export function tryGetCachedTreeNode(flexNode: InnerNode): TreeNode | undefined {
	if (isMapTreeNode(flexNode)) {
		// Unhydrated case
		return mapTreeNodeToProxy.get(flexNode);
	}
	// Hydrated case
	return flexNode.anchorNode.slots.get(proxySlot);
}

export function tryDisposeTreeNode(anchorNode: AnchorNode): void {
	const treeNode = anchorNode.slots.get(proxySlot);
	if (treeNode !== undefined) {
		const kernel = getKernel(treeNode);
		kernel.dispose();
	}
}

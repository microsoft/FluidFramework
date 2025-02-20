/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Lazy } from "@fluidframework/core-utils/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable, Off } from "@fluidframework/core-interfaces";
import type { InternalTreeNode, TreeNode, Unhydrated } from "./types.js";
import {
	anchorSlot,
	type AnchorEvents,
	type AnchorNode,
	type AnchorSet,
	type TreeValue,
	type UpPath,
} from "../../core/index.js";
import {
	assertFlexTreeEntityNotFreed,
	ContextSlot,
	flexTreeSlot,
	isFreedSymbol,
	LazyEntity,
	TreeStatus,
	treeStatusFromAnchorCache,
	type FlexTreeNode,
} from "../../feature-libraries/index.js";
import type { TreeNodeSchema } from "./treeNodeSchema.js";
import { fail } from "../../util/index.js";
// TODO: decide how to deal with dependencies on flex-tree implementation.
// eslint-disable-next-line import/no-internal-modules
import { makeTree } from "../../feature-libraries/flex-tree/lazyNode.js";
import { SimpleContextSlot, type Context, type HydratedContext } from "./context.js";
import { UnhydratedFlexTreeNode } from "./unhydratedFlexTree.js";

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

/** The {@link HydrationState} of a {@link TreeNodeKernel} before the kernel is hydrated */
interface UnhydratedState {
	off: Off;
	innerNode: UnhydratedFlexTreeNode;
}

/** The {@link HydrationState} of a {@link TreeNodeKernel} after the kernel is hydrated */
interface HydratedState {
	/** The flex node for this kernel (lazy - undefined if it has not yet been demanded) */
	innerNode?: FlexTreeNode;
	/** The {@link AnchorNode} that this node is associated with. */
	anchorNode: AnchorNode;
	/** All {@link Off | event deregistration functions} that should be run when the kernel is disposed. */
	offAnchorNode: Set<Off>;
}

/** State within a {@link TreeNodeKernel} that is related to the hydration process */
type HydrationState = UnhydratedState | HydratedState;

/** True if and only if the given {@link HydrationState} is post-hydration */
function isHydrated(state: HydrationState): state is HydratedState {
	return (state as Partial<HydratedState>).anchorNode !== undefined;
}

/**
 * Contains state and an internal API for managing {@link TreeNode}s.
 * @remarks All {@link TreeNode}s have an associated kernel object.
 * The kernel has the same lifetime as the node and spans both its unhydrated and hydrated states.
 */
export class TreeNodeKernel {
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

	#hydrationState: HydrationState;

	/**
	 * Events registered before hydration.
	 * @remarks
	 * Since these are usually not used, they are allocated lazily as an optimization.
	 * The laziness also avoids extra forwarding overhead for events from this kernel's anchor node and also avoids registering for events that are unneeded.
	 * This means optimizations like skipping processing data in subtrees where no subtreeChanged events are subscribed to would be able to work,
	 * since the kernel does not unconditionally subscribe to those events (like a design which simply forwards all events would).
	 */
	readonly #unhydratedEvents = new Lazy(createEmitter<KernelEvents>);

	/**
	 * Create a TreeNodeKernel which can be looked up with {@link getKernel}.
	 *
	 * @param initialContext - context from when this node was originally crated.
	 * @param innerNode - When unhydrated/raw or marinated the MapTreeNode. FlexTreeNode when cooked.
	 * @remarks
	 * Exactly one kernel per TreeNode should be created.
	 */
	public constructor(
		public readonly node: TreeNode,
		public readonly schema: TreeNodeSchema,
		innerNode: InnerNode,
		private readonly initialContext: Context,
	) {
		assert(!treeNodeToKernel.has(node), 0xa1a /* only one kernel per node can be made */);
		treeNodeToKernel.set(node, this);

		if (innerNode instanceof UnhydratedFlexTreeNode) {
			// Unhydrated case
			unhydratedFlexTreeNodeToTreeNodeInternal.set(innerNode, node);
			// Register for change events from the unhydrated flex node.
			// These will be fired if the unhydrated node is edited, and will also be forwarded later to the hydrated node.
			this.#hydrationState = {
				innerNode,
				off: innerNode.events.on("childrenChangedAfterBatch", ({ changedFields }) => {
					this.#unhydratedEvents.value.emit("childrenChangedAfterBatch", {
						changedFields,
					});

					let n: UnhydratedFlexTreeNode | undefined = innerNode;
					while (n !== undefined) {
						const treeNode = unhydratedFlexTreeNodeToTreeNodeInternal.get(n);
						if (treeNode !== undefined) {
							const kernel = getKernel(treeNode);
							kernel.#unhydratedEvents.value.emit("subtreeChangedAfterBatch");
						}
						// This cast is safe because the parent (if it exists) of an unhydrated flex node is always another unhydrated flex node.
						n = n.parentField.parent.parent as UnhydratedFlexTreeNode | undefined;
					}
				}),
			};
		} else {
			// Hydrated case
			const { anchorNode } = innerNode;
			assert(
				!anchorNode.slots.has(proxySlot),
				0x7f5 /* Cannot associate an flex node with multiple simple-tree nodes */,
			);
			this.#hydrationState = this.createHydratedState(anchorNode);
		}
	}

	public get context(): Context {
		if (isHydrated(this.#hydrationState)) {
			// This can't be cached on this.#hydrated during hydration since initial tree is hydrated before the context is cached on the anchorSet.
			return (
				this.#hydrationState?.anchorNode.anchorSet.slots.get(SimpleContextSlot) ??
				fail("missing simple-tree context")
			);
		}
		return this.initialContext;
	}

	/**
	 * Transition from {@link Unhydrated} to hydrated.
	 * Bi-directionally associates the given hydrated TreeNode to the given anchor node.
	 * @remarks
	 * Happens at most once for any given node.
	 * Cleans up mappings to {@link UnhydratedFlexTreeNode} - it is assumed that they are no longer needed once the proxy has an anchor node.
	 */
	private hydrate(anchorNode: AnchorNode): void {
		assert(!this.disposed, 0xa2a /* cannot hydrate a disposed node */);
		assert(!isHydrated(this.#hydrationState), 0xa2b /* hydration should only happen once */);
		unhydratedFlexTreeNodeToTreeNodeInternal.delete(this.#hydrationState.innerNode);
		this.#hydrationState = this.createHydratedState(anchorNode);

		// If needed, register forwarding emitters for events from before hydration
		if (this.#unhydratedEvents.evaluated) {
			const events = this.#unhydratedEvents.value;
			for (const eventName of kernelEvents) {
				if (events.hasListeners(eventName)) {
					this.#hydrationState.offAnchorNode.add(
						// Argument is forwarded between matching events, so the type should be correct.
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						anchorNode.events.on(eventName, (arg: any) => events.emit(eventName, arg)),
					);
				}
			}
		}
	}

	private createHydratedState(anchorNode: AnchorNode): HydratedState {
		anchorNode.slots.set(proxySlot, this.node);
		return {
			anchorNode,
			offAnchorNode: new Set([
				anchorNode.events.on("afterDestroy", () => this.dispose()),
				// TODO: this should be triggered on change even for unhydrated nodes.
				anchorNode.events.on("childrenChanging", () => {
					this.generationNumber += 1;
				}),
			]),
		};
	}

	public getStatus(): TreeStatus {
		if (this.disposed) {
			return TreeStatus.Deleted;
		}
		if (!isHydrated(this.#hydrationState)) {
			return TreeStatus.New;
		}

		// TODO: Replace this check with the proper check against the cursor state when the cursor becomes part of the kernel
		const flex = this.#hydrationState.anchorNode.slots.get(flexTreeSlot);
		if (flex !== undefined) {
			assert(flex instanceof LazyEntity, 0x9b4 /* Unexpected flex node implementation */);
			if (flex[isFreedSymbol]()) {
				return TreeStatus.Deleted;
			}
		}

		return treeStatusFromAnchorCache(this.#hydrationState.anchorNode);
	}

	public get events(): Listenable<KernelEvents> {
		// Retrieve the correct events object based on whether this node is pre or post hydration.
		return isHydrated(this.#hydrationState)
			? this.#hydrationState.anchorNode.events
			: this.#unhydratedEvents.value;
	}

	public dispose(): void {
		this.disposed = true;
		if (isHydrated(this.#hydrationState)) {
			for (const off of this.#hydrationState.offAnchorNode) {
				off();
			}
		}
		// TODO: go to the context and remove myself from withAnchors
	}

	public isHydrated(): this is { anchorNode: AnchorNode; context: HydratedContext } {
		return isHydrated(this.#hydrationState);
	}

	public get anchorNode(): AnchorNode | undefined {
		return isHydrated(this.#hydrationState) ? this.#hydrationState.anchorNode : undefined;
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
		if (!isHydrated(this.#hydrationState)) {
			return this.#hydrationState.innerNode; // Unhydrated case
		}

		if (this.#hydrationState.innerNode !== undefined) {
			return this.#hydrationState.innerNode; // Cooked case
		}

		// Marinated case -> cooked
		const anchorNode = this.#hydrationState.anchorNode;
		// The proxy is bound to an anchor node, but it may or may not have an actual flex node yet
		const flexNode = anchorNode.slots.get(flexTreeSlot);
		if (flexNode !== undefined) {
			// If the flex node already exists, use it...
			this.#hydrationState.innerNode = flexNode;
		} else {
			// ...otherwise, the flex node must be created
			const context = anchorNode.anchorSet.slots.get(ContextSlot) ?? fail("missing context");
			const cursor = context.checkout.forest.allocateCursor("getFlexNode");
			context.checkout.forest.moveCursorToPath(anchorNode, cursor);
			this.#hydrationState.innerNode = makeTree(context, cursor);
			cursor.free();
			// Calling this is a performance improvement, however, do this only after demand to avoid momentarily having no anchors to anchorNode
			anchorForgetters?.get(this.node)?.();
			if (!allowFreed) {
				assertFlexTreeEntityNotFreed(this.#hydrationState.innerNode);
			}
		}

		return this.#hydrationState.innerNode;
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
		const off = anchorNode.events.on("afterDestroy", forget);
		return anchorNode;
	}

	/**
	 * Retrieves the InnerNode associated with the given target via {@link setInnerNode}, if any.
	 * @remarks
	 * If `target` is an unhydrated node, returns its UnhydratedFlexTreeNode.
	 * If `target` is a cooked node (or marinated but a FlexTreeNode exists) returns the FlexTreeNode.
	 * If the target is a marinated node with no FlexTreeNode for its anchor, returns undefined.
	 */
	public tryGetInnerNode(): InnerNode | undefined {
		if (isHydrated(this.#hydrationState)) {
			return (
				this.#hydrationState.innerNode ??
				this.#hydrationState.anchorNode.slots.get(flexTreeSlot)
			);
		}

		return this.#hydrationState.innerNode;
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
export type InnerNode = FlexTreeNode | UnhydratedFlexTreeNode;

/**
 * Associates a given {@link UnhydratedFlexTreeNode} with a {@link TreeNode}.
 */
const unhydratedFlexTreeNodeToTreeNodeInternal = new WeakMap<
	UnhydratedFlexTreeNode,
	TreeNode
>();
/**
 * Retrieves the {@link TreeNode} associated with the given {@link UnhydratedFlexTreeNode} if any.
 */
export const unhydratedFlexTreeNodeToTreeNode =
	unhydratedFlexTreeNodeToTreeNodeInternal as Pick<
		WeakMap<UnhydratedFlexTreeNode, TreeNode>,
		"get"
	>;

/**
 * An anchor slot which associates an anchor with its corresponding TreeNode, if there is one.
 * @remarks
 * For this to work, we have to require that there is at most a single view using a given AnchorSet.
 * FlexTree already has this assumption, and we also assume there is a single simple-tree per FlexTree, so this is valid.
 */
export const proxySlot = anchorSlot<TreeNode>();

export function tryDisposeTreeNode(anchorNode: AnchorNode): void {
	const treeNode = anchorNode.slots.get(proxySlot);
	if (treeNode !== undefined) {
		const kernel = getKernel(treeNode);
		kernel.dispose();
	}
}

/**
 * Lookup a TreeNodeSchema from a Hydrated FlexTreeNode.
 * @privateRemarks
 * This provides a way to access simple tree schema from the flex tree without depending on {@link FlexTreeSchema} which is in the process of being removed.
 * This is currently limited to hydrated nodes: this limitation will have to be fixed before {@link FlexTreeSchema} can be fully removed.
 */
export function getTreeNodeSchemaFromHydratedFlexNode(flexNode: FlexTreeNode): TreeNodeSchema {
	assert(
		flexNode.context.isHydrated(),
		0xa56 /* getTreeNodeSchemaFromHydratedFlexNode only allows hydrated flex tree nodes */,
	);

	const context =
		flexNode.anchorNode.anchorSet.slots.get(SimpleContextSlot) ??
		fail("Missing SimpleContextSlot");

	return context.schema.get(flexNode.schema) ?? fail("Missing schema");
}

/**
 * Retrieves the flex node associated with the given target via {@link setInnerNode}.
 * @remarks
 * For {@link Unhydrated} nodes, this returns the MapTreeNode.
 *
 * For hydrated nodes it returns a FlexTreeNode backed by the forest.
 * Note that for "marinated" nodes, this FlexTreeNode exists and returns it: it does not return the MapTreeNode which is the current InnerNode.
 */
export function getOrCreateInnerNode(treeNode: TreeNode, allowFreed = false): InnerNode {
	const kernel = getKernel(treeNode);
	return kernel.getOrCreateInnerNode(allowFreed);
}

/**
 * Gets a flex node from an anchor node
 */
function flexNodeFromAnchor(anchorNode: AnchorNode): FlexTreeNode {
	// the proxy is bound to an anchor node, but it may or may not have an actual flex node yet
	const flexNode = anchorNode.slots.get(flexTreeSlot);
	if (flexNode !== undefined) {
		return flexNode; // If it does have a flex node, return it...
	} // ...otherwise, the flex node must be created
	const context = anchorNode.anchorSet.slots.get(ContextSlot) ?? fail("missing context");
	const cursor = context.checkout.forest.allocateCursor("getFlexNode");
	context.checkout.forest.moveCursorToPath(anchorNode, cursor);
	const newFlexNode = makeTree(context, cursor);
	cursor.free();
	return newFlexNode;
}

/**
 * Gets a tree node from an anchor node
 */
export function treeNodeFromAnchor(anchorNode: AnchorNode): TreeNode | TreeValue {
	const cached = anchorNode.slots.get(proxySlot);
	if (cached !== undefined) {
		return cached;
	}

	const flexNode = flexNodeFromAnchor(anchorNode);
	const classSchema = getTreeNodeSchemaFromHydratedFlexNode(flexNode);
	return typeof classSchema === "function"
		? new classSchema(flexNode as unknown as InternalTreeNode)
		: (classSchema as { create(data: FlexTreeNode): TreeValue }).create(flexNode);
}

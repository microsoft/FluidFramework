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
import type { AnchorEvents, AnchorNode } from "../../core/index.js";
import {
	flexTreeSlot,
	isFreedSymbol,
	LazyEntity,
	TreeStatus,
	treeStatusFromAnchorCache,
} from "../../feature-libraries/index.js";
import type { TreeNodeSchema } from "./treeNodeSchema.js";

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
	 */
	public generationNumber: number = 0;

	#hydrated?: {
		anchorNode: AnchorNode;
		offAnchorNode: Set<Off>;
	};

	/**
	 * Events registered before hydration.
	 * @remarks
	 *
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
	 * avoids registering for events that the are unneeded.
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
	 * @remarks
	 * Exactly one kernel per TreeNode should be created.
	 */
	public constructor(
		public readonly node: TreeNode,
		public readonly schema: TreeNodeSchema,
	) {
		assert(!treeNodeToKernel.has(node), 0xa1a /* only one kernel per node can be made */);
		treeNodeToKernel.set(node, this);
	}

	/**
	 * Transition from {@link Unhydrated} to hydrated.
	 * @remarks
	 * Happens at most once for any given node.
	 */
	public hydrate(anchorNode: AnchorNode): void {
		assert(!this.disposed, "cannot use a disposed node");

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
		assert(!this.disposed, "cannot use a disposed node");
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
}

const kernelEvents = ["childrenChangedAfterBatch", "subtreeChangedAfterBatch"] as const;

type KernelEvents = Pick<AnchorEvents, (typeof kernelEvents)[number]>;

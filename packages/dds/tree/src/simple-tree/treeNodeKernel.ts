/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { createEmitter, type Listenable, type Off } from "../events/index.js";
import type { TreeChangeEvents, TreeNode } from "./types.js";
import type { AnchorNode, FieldKey } from "../core/index.js";
import {
	flexTreeSlot,
	isFreedSymbol,
	LazyEntity,
	TreeStatus,
	treeStatusFromAnchorCache,
} from "../feature-libraries/index.js";
import { getSimpleNodeSchema } from "./schemaCaching.js";
import { fail } from "../util/index.js";
import { isObjectNodeSchema } from "./objectNodeTypes.js";
import { NodeKind } from "./schemaTypes.js";

/**
 * Contains state and an internal API for managing {@link TreeNode}s.
 * @remarks All {@link TreeNode}s have an associated kernel object.
 * The kernel has the same lifetime as the node and spans both its unhydrated and hydrated states.
 * When hydration occurs, the kernel is notified via the {@link TreeNodeKernel.hydrate | hydrate} method.
 */
export class TreeNodeKernel implements Listenable<TreeChangeEvents> {
	#hydrated?: {
		anchorNode: AnchorNode;
		offAnchorNode: Off;
	};
	#events = createEmitter<TreeChangeEvents>();

	public constructor(public readonly node: TreeNode) {}

	public hydrate(anchorNode: AnchorNode): void {
		const offChildrenChanged = anchorNode.on(
			"childrenChangedAfterBatch",
			({ changedFields }) => {
				const flexNode = anchorNode.slots.get(flexTreeSlot);
				assert(flexNode !== undefined, "Flex node does not exist");
				const nodeSchema = getSimpleNodeSchema(flexNode.schema);
				let changedProperties: ReadonlySet<string>;
				if (isObjectNodeSchema(nodeSchema)) {
					changedProperties = new Set(
						Array.from(
							changedFields,
							(field) =>
								nodeSchema.storedKeyToViewKeyMap.get(field) ??
								fail(`Could not find stored key '${field}' in schema.`),
						),
					);
				} else if (nodeSchema.kind === NodeKind.Array) {
					// For array nodes, for now we don't have a good story of what we should expose as changed properties (indices?
					// even if that means including all indices if something is added/removed at the beginning of the array?), so
					// for now we just provide an empty set. In particular, we don't want to say "the key <empty string> changed"
					// which is what would happen if we just used the changedFields as the changedProperties because of the way
					// array nodes work.
					changedProperties = new Set();
				} else {
					changedProperties = changedFields;
				}
				this.#events.emit("nodeChanged", { changedProperties });
			},
		);

		const offSubtreeChanged = anchorNode.on("subtreeChangedAfterBatch", () => {
			this.#events.emit("treeChanged");
		});

		const offAfterDestroy = anchorNode.on("afterDestroy", () => this.dispose());

		this.#hydrated = {
			anchorNode,
			offAnchorNode: () => {
				offChildrenChanged();
				offSubtreeChanged();
				offAfterDestroy();
			},
		};
	}

	public dehydrate(): void {
		this.#hydrated?.offAnchorNode?.();
		this.#hydrated = undefined;
	}

	public isHydrated(): boolean {
		return this.#hydrated !== undefined;
	}

	public getStatus(): TreeStatus {
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

	public on<K extends keyof TreeChangeEvents>(
		eventName: K,
		listener: TreeChangeEvents[K],
	): Off {
		return this.#events.on(eventName, listener);
	}

	public dispose(): void {
		this.dehydrate();
		// TODO: go to the context and remove myself from withAnchors
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { disposeSymbol, fail, getOrCreate } from "../../util/index.js";
import {
	type Anchor,
	type AnchorNode,
	type FieldKey,
	type ProtoNodes,
	type TreeNodeSchemaIdentifier,
	forEachField,
	forEachNode,
	type ITreeSubscriptionCursor,
	createAnnouncedVisitor,
	type IForestSubscription,
} from "../../core/index.js";
import type { TreeIndex, TreeIndexKey, TreeIndexNodes } from "./types.js";
import { TreeStatus } from "../flex-tree/index.js";

/**
 * An index from some arbitrary keys to anchor nodes. Keys can be anything that is a {@link TreeValue}.
 * A key can map to multiple nodes but each collection of nodes only results in a single value.
 *
 * @remarks
 * Detached nodes are stored in the index but filtered out when any public facing apis are called. This means that
 * calling {@link keys} will not include any keys that are stored in the index but only map to detached nodes.
 *
 * TODO: need to make sure key finders are deterministic or have a way to invalidate them
 * TODO: the index does not update on leaf node changes
 */
export class AnchorTreeIndex<TKey extends TreeIndexKey, TValue>
	implements TreeIndex<TKey, TValue>
{
	/**
	 * The actual index from keys to anchor nodes.
	 */
	private readonly nodes = new Map<TKey, AnchorNode[]>();
	/**
	 * Keeps track of anchors for disposal.
	 */
	private readonly anchors = new Map<AnchorNode, Anchor>();

	/**
	 * @param forest - the forest that is being indexed
	 * @param keysToIndex - a map of which field to key on for each schema that can be indexed
	 * @param getValue - a function that returns the value or undefined given at least one anchor node
	 * @param checkTreeStatus - a function that gets the tree status from an anchor node, used for filtering out detached nodes
	 */
	public constructor(
		private readonly forest: IForestSubscription,
		private readonly keysToIndex = new Map<TreeNodeSchemaIdentifier, FieldKey>(),
		private readonly getValue: (anchorNodes: TreeIndexNodes<AnchorNode>) => TValue | undefined,
		private readonly checkTreeStatus: (node: AnchorNode) => TreeStatus | undefined,
	) {
		this.forest.registerAnnouncedVisitor(
			createAnnouncedVisitor({
				afterCreate: (content: ProtoNodes, destination: FieldKey) => {
					const cursor = this.forest.allocateCursor();
					this.forest.tryMoveCursorToField(
						{ fieldKey: destination, parent: undefined },
						cursor,
					);
					this.indexField(cursor);
					cursor.free();
				},
			}),
		);

		const detachedFieldKeys: FieldKey[] = [];
		const detachedFieldsCursor = forest.getCursorAboveDetachedFields();
		forEachField(detachedFieldsCursor, (field) => {
			detachedFieldKeys.push(field.getFieldKey());
		});

		// index all existing trees (this includes the primary document tree and all other detached/removed trees)
		for (const fieldKey of detachedFieldKeys) {
			const cursor = forest.allocateCursor();
			forest.tryMoveCursorToField({ fieldKey, parent: undefined }, cursor);
			this.indexField(cursor);
			cursor.free();
		}
	}

	/**
	 * Returns the value associated with the given key if it has been indexed
	 */
	public get(key: TKey): TValue | undefined {
		return this.getFilteredValue(this.nodes.get(key));
	}

	/**
	 * Returns true iff the key exists in the index
	 */
	public has(key: TKey): boolean {
		return this.get(key) !== undefined;
	}

	/**
	 * Returns the number of values that are indexed
	 */
	public get size(): number {
		let s = 0;
		for (const nodes of this.nodes.values()) {
			if (this.getFilteredValue(nodes) !== undefined) {
				s += 1;
			}
		}
		return s;
	}

	/**
	 * Returns all keys in the index
	 */
	public *keys(): IterableIterator<TKey> {
		for (const [key, nodes] of this.nodes.entries()) {
			if (this.getFilteredValue(nodes) !== undefined) {
				yield key;
			}
		}
	}

	/**
	 * Returns an iterable of values in the index
	 */
	public *values(): IterableIterator<TValue> {
		for (const nodes of this.nodes.values()) {
			const filtered = this.getFilteredValue(nodes);
			if (filtered !== undefined) {
				yield filtered;
			}
		}
	}

	/**
	 * Returns an iterable of key, value pairs for every entry in the index
	 */
	public *entries(): IterableIterator<[TKey, TValue]> {
		for (const [key, nodes] of this.nodes.entries()) {
			const filtered = this.getFilteredValue(nodes);
			if (filtered !== undefined) {
				yield [key, filtered];
			}
		}
	}

	public [Symbol.iterator](): IterableIterator<[TKey, TValue]> {
		return this.entries();
	}

	/**
	 * Applies the provided callback to each entry in the index.
	 */
	public forEach(
		callbackfn: (value: TValue, key: TKey, map: AnchorTreeIndex<TKey, TValue>) => void,
		thisArg?: unknown,
	): void {
		for (const [key, nodes] of this.nodes.entries()) {
			const filtered = this.getFilteredValue(nodes);
			if (filtered !== undefined) {
				callbackfn.call(thisArg, filtered, key, this);
			}
		}
	}

	/**
	 * Disposes this index and all the anchors it holds onto.
	 */
	public [disposeSymbol](): void {
		for (const anchor of this.anchors.values()) {
			this.forest.forgetAnchor(anchor);
		}
		this.anchors.clear();
		Reflect.defineProperty(this, disposeSymbol, {
			value: () => {
				throw new Error("Index is already disposed");
			},
		});
	}

	/**
	 * Given a cursor in field mode, recursively indexes all nodes under the field.
	 */
	private indexField(fieldCursor: ITreeSubscriptionCursor): void {
		forEachNode(fieldCursor, (nodeCursor) => {
			const keyField = this.keysToIndex.get(nodeCursor.type);

			if (keyField !== undefined) {
				const key = keyFinder<TKey>(nodeCursor, keyField);
				const anchor = nodeCursor.buildAnchor();
				const anchorNode = this.forest.anchors.locate(anchor) ?? fail("expected anchor node");

				const nodes = this.nodes.get(key);
				if (nodes !== undefined) {
					// if the key already exists in the index, the anchor node is appended to its list of nodes
					nodes.push(anchorNode);
				} else {
					this.nodes.set(key, [anchorNode]);
				}

				this.anchors.set(anchorNode, anchor);
				// when the anchor node is destroyed, delete it from the index
				anchorNode.on("afterDestroy", () => {
					const indexedNodes = this.nodes.get(key);
					assert(
						indexedNodes !== undefined,
						"destroyed anchor node should be tracked by index",
					);
					const index = indexedNodes.indexOf(anchorNode);
					assert(index !== -1, "destroyed anchor node should be tracked by index");
					const newNodes = filterNodes(nodes, (n) => n !== anchorNode);
					if (newNodes !== undefined) {
						this.nodes.set(key, newNodes);
					} else {
						this.nodes.delete(key);
					}
					assert(
						this.anchors.delete(anchorNode),
						"destroyed anchor should be tracked by index",
					);
				});
			}

			forEachField(nodeCursor, (f) => {
				this.indexField(f);
			});
		});
	}

	/**
	 * Filters out any anchor nodes that are detached and returns the value for the remaining nodes.
	 */
	private getFilteredValue(anchorNodes: AnchorNode[] | undefined): TValue | undefined {
		const attachedNodes = filterNodes(anchorNodes, (anchorNode) => {
			const nodeStatus = this.checkTreeStatus(anchorNode);
			return nodeStatus === TreeStatus.InDocument;
		});

		if (attachedNodes !== undefined && hasElement(attachedNodes)) {
			return this.getValue(attachedNodes);
		}
	}
}

/**
 * Filters the given anchor nodes based on the given filter function.
 */
function filterNodes(
	anchorNodes: readonly AnchorNode[] | undefined,
	filter: (node: AnchorNode) => boolean,
): AnchorNode[] | undefined {
	if (anchorNodes !== undefined) {
		return anchorNodes.filter(filter);
	}

	return undefined;
}

/**
 * Checks that an array is of the type {@link TreeIndexNodes} and has at least one element.
 */
export function hasElement<T>(array: readonly T[]): array is TreeIndexNodes<T> {
	return array.length >= 1;
}


function keyFinder<TKey>(tree: ITreeSubscriptionCursor, keyField: FieldKey): TKey {

}
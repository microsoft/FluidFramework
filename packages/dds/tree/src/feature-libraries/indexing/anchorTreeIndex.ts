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
	type IForestSubscription,
	type ITreeSubscriptionCursor,
	type TreeNodeSchemaIdentifier,
	type TreeValue,
	forEachField,
	forEachNode,
} from "../../core/index.js";
import type { TreeIndex, TreeIndexNodes } from "./types.js";
import type { TreeStatus } from "../flex-tree/index.js";

/**
 * Specifies whether an indexable tree is currently in the document,
 * removed, or both (meaning it is in a detached state).
 */
export type IndexableTreeStatus =
	| keyof Pick<typeof TreeStatus, "InDocument" | "Removed">
	| "InDocumentAndRemoved";

/**
 * A function that returns some key given a cursor to a node where the key is what the node
 * is indexed on.
 * 
 * TODO: document cursor ownership
 */
export type KeyFinder<TKey extends TreeValue> = (tree: ITreeSubscriptionCursor) => TKey;

/**
 * An index from some arbitrary keys to anchor nodes. Keys can be anything that is a {@link TreeValue}.
 */
export class AnchorTreeIndex<TKey extends TreeValue, TValue>
	implements TreeIndex<TKey, TValue>
{
	/**
	 * Caches {@link KeyFinder}s for each schema definition. If a schema maps to null, it does not
	 * need to be considered at all for this index. This allows us to skip subtrees that aren't relevant
	 * as a performance optimization.
	 */
	private readonly keyFinders = new Map<TreeNodeSchemaIdentifier, KeyFinder<TKey> | null>();
	/**
	 * The actual index from keys to anchor nodes.
	 */
	private readonly nodes = new Map<TKey, TreeIndexNodes<AnchorNode>>();
	/**
	 * Keeps track of anchors for disposal.
	 */
	private readonly anchors = new Map<AnchorNode, Anchor>();

	/**
	 * @param forest - the forest that is being indexed
	 * @param indexer - a function that retrieves the key finder based on a given schema or undefined if the schema does not have an associated key finder
	 * @param getValue - a function that returns the value or undefined given at least one anchor node
	 */
	public constructor(
		private readonly forest: IForestSubscription,
		indexer: (schemaId: TreeNodeSchemaIdentifier) => KeyFinder<TKey> | undefined,
		private readonly getValue: (anchorNodes: TreeIndexNodes<AnchorNode>) => TValue | undefined,
	) {
		const indexField = (fieldCursor: ITreeSubscriptionCursor): void => {
			forEachNode(fieldCursor, (nodeCursor) => {
				const keyFinder = getOrCreate(
					this.keyFinders,
					fieldCursor.type,
					(schema) => indexer(schema) ?? null,
				);
				if (keyFinder !== null) {
					const key = keyFinder(fieldCursor);
					const anchor = fieldCursor.buildAnchor();
					const anchorNode = forest.anchors.locate(anchor) ?? fail("Expected anchor node");

					const nodes = this.nodes.get(key);
					if (nodes !== undefined) {
						this.nodes.set(key, [...nodes, anchorNode]);
					} else {
						this.nodes.set(key, [anchorNode]);
					}
					this.anchors.set(anchorNode, anchor);
					anchorNode.on("afterDestroy", () => {
						const ns = this.nodes.get(key);
						assert(ns !== undefined, "Destroyed anchor node should be tracked by index");
						const index = ns.indexOf(anchorNode);
						assert(index !== -1, "Destroyed anchor node should be tracked by index");
						const newNodes = filterNodes(nodes, (n) => n !== anchorNode);
						if (newNodes !== undefined) {
							this.nodes.set(key, newNodes);
						} else {
							this.nodes.delete(key);
						}
						assert(
							this.anchors.delete(anchorNode),
							"Destroyed anchor should be tracked by index",
						);
					});
				}

				forEachField(nodeCursor, (f) => {
					indexField(f);
				});
			});
		};

		const detachedFieldKeys: FieldKey[] = [];
		const detachedFieldsCursor = forest.getCursorAboveDetachedFields();
		forEachField(detachedFieldsCursor, (field) => {
			detachedFieldKeys.push(field.getFieldKey());
		});

		// Index all existing trees (this includes the primary document tree and all other detached/removed trees)
		for (const fieldKey of detachedFieldKeys) {
			const cursor = forest.allocateCursor();
			forest.tryMoveCursorToField({ fieldKey, parent: undefined }, cursor);
			indexField(cursor);
			cursor.free();
		}

		// Index any new trees that are created later
		forest.on("afterRootFieldCreated", (fieldKey) => {
			const cursor = forest.allocateCursor();
			forest.tryMoveCursorToField({ fieldKey, parent: undefined }, cursor);
			indexField(cursor);
			cursor.free();
		});
	}

	public get(key: TKey): TValue | undefined {
		return this.filterNodes(this.nodes.get(key));
	}

	public has(key: TKey): boolean {
		return this.get(key) !== undefined;
	}

	public get size(): number {
		let s = 0;
		for (const nodes of this.nodes.values()) {
			if (this.filterNodes(nodes) !== undefined) {
				s += 1;
			}
		}
		return s;
	}

	public *keys(): IterableIterator<TKey> {
		for (const [key, nodes] of this.nodes.entries()) {
			if (this.filterNodes(nodes) !== undefined) {
				yield key;
			}
		}
	}

	public *values(): IterableIterator<TValue> {
		for (const nodes of this.nodes.values()) {
			const filtered = this.filterNodes(nodes);
			if (filtered !== undefined) {
				yield filtered;
			}
		}
	}
	public *entries(): IterableIterator<[TKey, TValue]> {
		for (const [key, nodes] of this.nodes.entries()) {
			const filtered = this.filterNodes(nodes);
			if (filtered !== undefined) {
				yield [key, filtered];
			}
		}
	}

	public [Symbol.iterator](): IterableIterator<[TKey, TValue]> {
		return this.entries();
	}

	public forEach(
		callbackfn: (value: TValue, key: TKey, map: AnchorTreeIndex<TKey, TValue>) => void,
		thisArg?: any,
	): void {
		for (const [key, nodes] of this.nodes.entries()) {
			const filtered = this.filterNodes(nodes);
			if (filtered !== undefined) {
				callbackfn.call(thisArg, filtered, key, this);
			}
		}
	}

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

	private filterNodes(
		anchorNodes: TreeIndexNodes<AnchorNode> | undefined,
	): TValue | undefined {
		if (anchorNodes !== undefined) {
			return this.getValue(anchorNodes);
		}
	}
}

function filterNodes(
	anchorNodes: readonly AnchorNode[] | undefined,
	filter: (node: AnchorNode) => boolean,
): TreeIndexNodes<AnchorNode> | undefined {
	if (anchorNodes !== undefined) {
		const filteredNodes: readonly AnchorNode[] = anchorNodes.filter(filter);
		if (hasElement(filteredNodes)) {
			return filteredNodes;
		}
	}

	return undefined;
}

export function hasElement<T>(array: readonly T[]): array is TreeIndexNodes<T> {
	return array.length >= 1;
}

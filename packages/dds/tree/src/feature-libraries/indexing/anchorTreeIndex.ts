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
	type TreeNodeSchemaIdentifier,
	forEachField,
	forEachNode,
	type ITreeSubscriptionCursor,
	createAnnouncedVisitor,
	type IForestSubscription,
	type AnnouncedVisitor,
	CursorLocationType,
	rootField,
	type UpPath,
	keyAsDetachedField,
	compareUpPaths,
	TreeNavigationResult,
	type ITreeCursorSynchronous,
} from "../../core/index.js";
import type { TreeIndex, TreeIndexKey, TreeIndexNodes } from "./types.js";
import { TreeStatus } from "../flex-tree/index.js";

/**
 * A function that gets the value to index a node on, must be pure and functional.
 * The given cursor should point to the node that will be indexed.
 *
 * @returns a value the index will use as the key for the given node
 *
 * @remarks
 * This function does not own the cursor in any way, it walks the cursor to find the key the node is indexed on
 * but returns the cursor to the state it was in before being passed to the function. It should also not be disposed by this function
 * and must be disposed elsewhere.
 */
export type KeyFinder<TKey extends TreeIndexKey> = (tree: ITreeSubscriptionCursor) => TKey;

/**
 * An index from some arbitrary keys to anchor nodes. Keys can be anything that is a {@link TreeValue}.
 * A key can map to multiple nodes but each collection of nodes only results in a single value.
 *
 * @remarks
 * Detached nodes are stored in the index but filtered out when any public facing apis are called. This means that
 * calling {@link keys} will not include any keys that are stored in the index but only map to detached nodes.
 */
export class AnchorTreeIndex<TKey extends TreeIndexKey, TValue>
	implements TreeIndex<TKey, TValue>
{
	public disposed = false;
	/**
	 * Caches {@link KeyFinder}s for each schema definition. If a schema maps to null, it does not
	 * need to be considered at all for this index. This allows us to skip subtrees that aren't relevant
	 * as a performance optimization.
	 */
	private readonly keyFinders = new Map<TreeNodeSchemaIdentifier, KeyFinder<TKey> | null>();
	/**
	 * The actual index from keys to anchor nodes.
	 */
	private readonly keyToNodes = new Map<TKey, AnchorNode[]>();
	/**
	 * Maintained for efficient removal of anchor nodes from the index when updating their keys
	 */
	private readonly nodeToKey = new Map<AnchorNode, TKey>();
	/**
	 * Keeps track of anchors for disposal.
	 */
	private readonly anchors = new Map<AnchorNode, Anchor[]>();
	/**
	 * The key finder that is registered on the forest to keep this index updated, maintained
	 * here for deregistration on disposal
	 */
	private readonly keyFinder = this.acquireVisitor.bind(this);

	/**
	 * @param forest - the forest that is being indexed
	 * @param indexer - a function that retrieves the key finder based on a given schema or undefined if the schema does not have an associated key finder
	 * @param getValue - a pure and functional function that returns the associated value of one or more anchor nodes, can be used to map and filter the indexed anchor nodes
	 * so that the values returned from the index are more usable
	 * @param checkTreeStatus - a function that gets the tree status from an anchor node, used for filtering out detached nodes
	 * @param isShallowIndex - indicates if this index is shallow, meaning that it only allows nodes to be keyed off of fields directly under them rather than anywhere in their subtree.
	 * As a performance optimization, re-indexing up the spine can be turned off for shallow indexes.
	 */
	public constructor(
		private readonly forest: IForestSubscription,
		private readonly indexer: (
			schemaId: TreeNodeSchemaIdentifier,
		) => KeyFinder<TKey> | undefined,
		private readonly getValue: (anchorNodes: TreeIndexNodes<AnchorNode>) => TValue | undefined,
		private readonly checkTreeStatus: (node: AnchorNode) => TreeStatus | undefined,
		private readonly isShallowIndex = false,
	) {
		this.forest.registerAnnouncedVisitor(this.keyFinder);

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
	 * Creates an announced visitor that responds to edits to the forest and updates the index accordingly.
	 */
	private acquireVisitor(): AnnouncedVisitor {
		this.checkNotDisposed(
			"visitor getter should be deregistered from the forest when index is disposed",
		);
		let parentField: FieldKey | undefined;
		let parent: UpPath | undefined;

		return createAnnouncedVisitor({
			// nodes (and their entire subtrees) are added to the index as soon as they are created
			afterCreate: (content: ITreeCursorSynchronous[], destination: FieldKey) => {
				const detachedCursor = this.forest.allocateCursor();
				assert(
					this.forest.tryMoveCursorToField(
						{ fieldKey: destination, parent: undefined },
						detachedCursor,
					) === TreeNavigationResult.Ok,
					0xa8a /* destination of created nodes must be a valid detached field */,
				);
				this.indexField(detachedCursor);
				detachedCursor.free();
			},
			afterAttach: () => {
				assert(parent !== undefined, 0xa99 /* must have a parent */);
				this.reIndexSpine(parent);
			},
			afterDetach: () => {
				assert(parent !== undefined, 0xa9a /* must have a parent */);
				this.reIndexSpine(parent);
			},
			// when a replace happens, the keys of previously indexed nodes could be changed so we must re-index them
			afterReplace: () => {
				assert(parent !== undefined, 0xa8b /* must have a parent */);
				const cursor = this.forest.allocateCursor();
				this.forest.moveCursorToPath(parent, cursor);
				assert(
					cursor.mode === CursorLocationType.Nodes,
					0xa8c /* replace should happen in a node */,
				);
				cursor.exitNode();
				this.indexField(cursor);
				if (!this.isShallowIndex) {
					// we must also re-index the spine if the key finders allow for any value under a subtree to be the key
					// this means that a replace can cause the key for any node up its spine to be changed
					this.indexSpine(cursor);
				}
				cursor.clear();
			},
			// the methods below are used to keep track of the path that has been traversed by the visitor
			// this is required so that cursors can be moved to the correct location when index updates are required
			enterNode(index: number): void {
				assert(parentField !== undefined, 0xa8d /* must be in a field to enter node */);

				parent = {
					parent,
					parentField,
					parentIndex: index,
				};
				parentField = undefined;
			},
			exitNode(index: number): void {
				assert(parent !== undefined, 0xa8e /* must have parent node */);
				const temp = parent;
				parentField = temp.parentField;
				parent = temp.parent;
			},
			enterField: (key: FieldKey) => {
				parentField = key;
			},
			exitField(key: FieldKey): void {
				parentField = undefined;
			},
		});
	}

	/**
	 * Returns the value associated with the given key if it has been indexed
	 */
	public get(key: TKey): TValue | undefined {
		this.checkNotDisposed();
		return this.getFilteredValue(this.keyToNodes.get(key));
	}

	/**
	 * Returns true iff the key exists in the index
	 */
	public has(key: TKey): boolean {
		this.checkNotDisposed();
		return this.get(key) !== undefined;
	}

	/**
	 * Returns the number of values that are indexed
	 */
	public get size(): number {
		this.checkNotDisposed();
		let s = 0;
		for (const nodes of this.keyToNodes.values()) {
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
		this.checkNotDisposed();
		for (const [key, nodes] of this.keyToNodes.entries()) {
			if (this.getFilteredValue(nodes) !== undefined) {
				yield key;
			}
		}
	}

	/**
	 * Returns an iterable of values in the index
	 */
	public *values(): IterableIterator<TValue> {
		this.checkNotDisposed();
		for (const nodes of this.keyToNodes.values()) {
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
		this.checkNotDisposed();
		for (const [key, nodes] of this.keyToNodes.entries()) {
			const filtered = this.getFilteredValue(nodes);
			if (filtered !== undefined) {
				yield [key, filtered];
			}
		}
	}

	public [Symbol.iterator](): IterableIterator<[TKey, TValue]> {
		this.checkNotDisposed();
		return this.entries();
	}

	/**
	 * Applies the provided callback to each entry in the index.
	 */
	public forEach(
		callbackfn: (value: TValue, key: TKey, map: AnchorTreeIndex<TKey, TValue>) => void,
		thisArg?: unknown,
	): void {
		this.checkNotDisposed();
		for (const [key, nodes] of this.keyToNodes.entries()) {
			const filtered = this.getFilteredValue(nodes);
			if (filtered !== undefined) {
				callbackfn.call(thisArg, filtered, key, this);
			}
		}
	}

	/**
	 * Returns an iterable of key, value pairs for every entry in the index, including ones that are detached.
	 * This function should only be used for testing purposes, it is not exposed as part of the public {@link TreeIndex} API.
	 */
	public *allEntries(): IterableIterator<[TKey, TValue]> {
		this.checkNotDisposed();
		for (const [key, nodes] of this.keyToNodes.entries()) {
			const value = this.getValue(nodes as unknown as TreeIndexNodes<AnchorNode>);
			if (value !== undefined) {
				yield [key, value];
			}
		}
	}

	public dispose(): void {
		this[disposeSymbol]();
	}

	/**
	 * Disposes this index and all the anchors it holds onto.
	 */
	public [disposeSymbol](): void {
		this.checkNotDisposed("index is already disposed");
		for (const anchors of this.anchors.values()) {
			for (const anchor of anchors) {
				this.forest.forgetAnchor(anchor);
			}
		}
		this.keyToNodes.clear();
		this.anchors.clear();
		this.forest.deregisterAnnouncedVisitor(this.keyFinder);
		this.disposed = true;
	}

	/**
	 * Checks if the spine needs to be re-indexed and if so, re-indexes it starting from the given path.
	 */
	private reIndexSpine(path: UpPath): void {
		if (!this.isShallowIndex) {
			const cursor = this.forest.allocateCursor();
			this.forest.moveCursorToPath(path, cursor);
			assert(
				cursor.mode === CursorLocationType.Nodes,
				0xa9b /* attach should happen in a node */,
			);
			cursor.exitNode();
			this.indexSpine(cursor);
			cursor.clear();
		}
	}

	private checkNotDisposed(errorMessage?: string): void {
		if (this.disposed) {
			if (errorMessage !== undefined) {
				throw new Error(errorMessage);
			}
			assert(false, 0xa8f /* invalid operation on a disposed index */);
		}
	}

	/**
	 * Given a cursor in node mode, indexes it.
	 */
	private indexNode(nodeCursor: ITreeSubscriptionCursor): void {
		const keyFinder = getOrCreate(
			this.keyFinders,
			// the node schema type to look up
			nodeCursor.type,
			// if the indexer does not return a key finder for this schema, we cache a null value to indicate the indexer
			// does not need to be called if this schema is encountered in the future
			(schema) => this.indexer(schema) ?? null,
		);

		if (keyFinder !== null) {
			const expectedPath = nodeCursor.getPath();
			const key = keyFinder(nodeCursor);
			// TODO: determine perf impact of this check, alternative is not doing it in which case (if the key finder is not pure and functional),
			// an error may be thrown further down the line if the structure of the nodes aren't expected or the contents of the index could be inaccurate
			if (!compareUpPaths(nodeCursor.getPath(), expectedPath)) {
				throw new Error("key finder should be pure and functional");
			}
			const anchor = nodeCursor.buildAnchor();
			const anchorNode =
				this.forest.anchors.locate(anchor) ?? fail(0xb16 /* expected anchor node */);

			// check if this anchor node already exists in the index
			const existingKey = this.nodeToKey.get(anchorNode);
			if (existingKey !== undefined) {
				// if the node already exists but has the same key, we return early
				if (existingKey === key) {
					this.forest.forgetAnchor(anchor);
					return;
				} else {
					// if the node has a different key, we remove the existing one first because it means the key had been detached
					this.removeAnchor(anchorNode, existingKey);
				}
			}

			getOrCreate(this.keyToNodes, key, () => []).push(anchorNode);
			this.nodeToKey.set(anchorNode, key);

			getOrCreate(this.anchors, anchorNode, () => []).push(anchor);
			// when the anchor node is destroyed, delete it from the index
			anchorNode.events.on("afterDestroy", () => {
				this.removeAnchor(anchorNode, key);
			});
		}
	}

	/**
	 * Given a cursor in field mode, recursively indexes all nodes under the field.
	 */
	private indexField(fieldCursor: ITreeSubscriptionCursor): void {
		forEachNode(fieldCursor, (nodeCursor) => {
			this.indexNode(nodeCursor);

			forEachField(nodeCursor, (f) => {
				this.indexField(f);
			});
		});
	}

	/**
	 * Given a cursor in field mode, indexes all nodes under the field and then indexes all nodes up the spine.
	 */
	private indexSpine(cursor: ITreeSubscriptionCursor): void {
		if (keyAsDetachedField(cursor.getFieldKey()) !== rootField) {
			cursor.exitField();
			cursor.exitNode();
		} else {
			// return early if we're already at the root field
			return;
		}

		// walk up the spine and index nodes until we reach the root
		while (
			cursor.mode === CursorLocationType.Fields &&
			keyAsDetachedField(cursor.getFieldKey()) !== rootField
		) {
			forEachNode(cursor, (nodeCursor) => {
				this.indexNode(nodeCursor);
			});

			cursor.exitField();
			cursor.exitNode();
		}
	}

	private removeAnchor(anchorNode: AnchorNode, key: TKey): void {
		const indexedNodes = this.keyToNodes.get(key);
		assert(
			indexedNodes !== undefined,
			0xa90 /* destroyed anchor node should be tracked by index */,
		);
		const index = indexedNodes.indexOf(anchorNode);
		assert(index !== -1, 0xa91 /* destroyed anchor node should be tracked by index */);
		const newNodes = filterNodes(indexedNodes, (n) => n !== anchorNode);
		if (newNodes !== undefined && newNodes.length > 0) {
			this.keyToNodes.set(key, newNodes);
		} else {
			this.keyToNodes.delete(key);
		}
		this.nodeToKey.delete(anchorNode);
		assert(
			this.anchors.delete(anchorNode),
			0xa92 /* destroyed anchor should be tracked by index */,
		);
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { FieldKey, SchemaData, ValueSchema } from "../../core";
import { Struct, TreeContext, TreeField, boxedIterator } from "../editable-tree-2";
import { LocalNodeKey, nodeKeyTreeIdentifier } from "./nodeKey";

/**
 * The node key index records nodes with {@link LocalNodeKey}s and allows them to be looked up by key.
 */
export class NodeKeyIndex implements ReadonlyMap<LocalNodeKey, Struct> {
	// TODO: The data structure that holds the nodes can likely be optimized to better support cloning
	private readonly nodes: Map<LocalNodeKey, Struct>;

	public constructor(
		public readonly fieldKey: FieldKey,
		keys: Iterable<[LocalNodeKey, Struct]> = [],
	) {
		this.nodes = new Map(keys);
	}

	/**
	 * Returns true if the given schema contains the node key type, otherwise false
	 */
	public static hasNodeKeyTreeSchema(schema: SchemaData): boolean {
		// TODO: make SchemaData contain ViewSchema and compare by reference to nodeKeyTreeSchema.
		const treeSchema = schema.treeSchema.get(nodeKeyTreeIdentifier);
		if (treeSchema === undefined) {
			return false;
		}
		return treeSchema.leafValue === ValueSchema.String;
	}

	/**
	 * Search the tree for all nodes with keys, and record them in this index for lookup.
	 * This should be called each time the tree changes; each call to scan forgets all existing keys.
	 * @param context - the editable tree context in which to search for node keys
	 */
	// TODO: This can be optimized by responding to deltas/changes to the tree, rather than rescanning the whole tree every time
	public scanKeys(context: TreeContext): void {
		this.nodes.clear();
		if (NodeKeyIndex.hasNodeKeyTreeSchema(context.schema)) {
			for (const [id, node] of this.findKeysInField(context.root)) {
				// TODO:
				// This invariant (that there is only one node with a given key) is not enforced by tree, so it should not assert.
				// Multiple nodes (including deleted ones), might occur with the same key.
				assert(!this.nodes.has(id), 0x6e1 /* Encountered duplicate node key */);
				this.nodes.set(id, node);
			}
		}
	}

	/**
	 * Create a copy of this index which can be mutated without affecting this one.
	 */
	public clone(context: TreeContext): NodeKeyIndex {
		const indexClone = new NodeKeyIndex(this.fieldKey);
		indexClone.scanKeys(context);
		return indexClone;
	}

	// #region ReadonlyMap interface
	public forEach(
		callbackfn: (
			value: Struct,
			key: LocalNodeKey,
			map: ReadonlyMap<LocalNodeKey, Struct>,
		) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: LocalNodeKey): Struct | undefined {
		return this.nodes.get(key);
	}
	public has(key: LocalNodeKey): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[LocalNodeKey, Struct]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<LocalNodeKey> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<Struct> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[LocalNodeKey, Struct]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findKeys(node: Struct): Iterable<[key: LocalNodeKey, node: Struct]> {
		const key = node.localNodeKey;
		if (key !== undefined) {
			yield [key, node];
		}
		for (const f of node[boxedIterator]()) {
			yield* this.findKeysInField(f);
		}
	}

	private *findKeysInField(f: TreeField): Iterable<[key: LocalNodeKey, node: Struct]> {
		for (const child of f[boxedIterator]()) {
			yield* this.findKeys(child);
		}
	}
}

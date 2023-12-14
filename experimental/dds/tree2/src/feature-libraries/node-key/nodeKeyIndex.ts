/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { FieldKey, ValueSchema } from "../../core";
import {
	FlexTreeObjectNode,
	FlexTreeContext,
	FlexTreeField,
	FlexTreeNode,
	boxedIterator,
} from "../flex-tree";
import { FlexTreeSchema, LeafNodeSchema, schemaIsObjectNode } from "../typed-schema";
import { LocalNodeKey, nodeKeyTreeIdentifier } from "./nodeKey";

/**
 * The node key index records nodes with {@link LocalNodeKey}s and allows them to be looked up by key.
 */
export class NodeKeyIndex implements ReadonlyMap<LocalNodeKey, FlexTreeObjectNode> {
	// TODO: The data structure that holds the nodes can likely be optimized to better support cloning
	private readonly nodes: Map<LocalNodeKey, FlexTreeObjectNode>;

	public constructor(
		public readonly fieldKey: FieldKey,
		keys: Iterable<[LocalNodeKey, FlexTreeObjectNode]> = [],
	) {
		this.nodes = new Map(keys);
	}

	/**
	 * Returns true if the given schema contains the node key type, otherwise false
	 */
	public static hasNodeKeyTreeSchema(schema: FlexTreeSchema): boolean {
		// TODO: make TreeStoredSchema contain ViewSchema and compare by reference to nodeKeyTreeSchema.
		const treeSchema = schema.nodeSchema.get(nodeKeyTreeIdentifier);
		if (!(treeSchema instanceof LeafNodeSchema)) {
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
	public scanKeys(context: FlexTreeContext): void {
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
	public clone(context: FlexTreeContext): NodeKeyIndex {
		const indexClone = new NodeKeyIndex(this.fieldKey);
		indexClone.scanKeys(context);
		return indexClone;
	}

	// #region ReadonlyMap interface
	public forEach(
		callbackfn: (
			value: FlexTreeObjectNode,
			key: LocalNodeKey,
			map: ReadonlyMap<LocalNodeKey, FlexTreeObjectNode>,
		) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: LocalNodeKey): FlexTreeObjectNode | undefined {
		return this.nodes.get(key);
	}
	public has(key: LocalNodeKey): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[LocalNodeKey, FlexTreeObjectNode]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<LocalNodeKey> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<FlexTreeObjectNode> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[LocalNodeKey, FlexTreeObjectNode]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findKeys(node: FlexTreeNode): Iterable<[key: LocalNodeKey, node: FlexTreeObjectNode]> {
		if (schemaIsObjectNode(node.schema)) {
			const key = (node as FlexTreeObjectNode).localNodeKey;
			if (key !== undefined) {
				yield [key, node as FlexTreeObjectNode];
			}
		}
		for (const f of node[boxedIterator]()) {
			yield* this.findKeysInField(f);
		}
	}

	private *findKeysInField(
		f: FlexTreeField,
	): Iterable<[key: LocalNodeKey, node: FlexTreeObjectNode]> {
		for (const child of f[boxedIterator]()) {
			yield* this.findKeys(child);
		}
	}
}

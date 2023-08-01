/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { FieldKey, SchemaData, ValueSchema } from "../../core";
import { FieldKinds } from "../default-field-kinds";
import { EditableTree, EditableTreeContext, localNodeKeySymbol } from "../editable-tree";
import { oneFromSet } from "../../util";
import { typeSymbol } from "../untypedTree";
import { LocalNodeKey, nodeKeyTreeIdentifier } from "./nodeKey";

/**
 * The node key index records nodes with {@link LocalNodeKey}s and allows them to be looked up by key.
 */
export class NodeKeyIndex implements ReadonlyMap<LocalNodeKey, EditableTree> {
	// TODO: The data structure that holds the nodes can likely be optimized to better support cloning
	private readonly nodes: Map<LocalNodeKey, EditableTree>;

	public constructor(
		public readonly fieldKey: FieldKey,
		keys: Iterable<[LocalNodeKey, EditableTree]> = [],
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
	public scanKeys(context: EditableTreeContext): void {
		if (NodeKeyIndex.hasNodeKeyTreeSchema(context.schema)) {
			this.nodes.clear();
			for (let i = 0; i < context.root.length; i++) {
				for (const [id, node] of this.findKeys(context.root.getNode(i))) {
					// TODO:
					// This invariant (that there is only one node with a given key) is not enforced by tree, so it should not assert.
					// Multiple nodes (including deleted ones), might occur with the same key.
					assert(!this.nodes.has(id), 0x6e1 /* Encountered duplicate node key */);
					this.nodes.set(id, node);
				}
			}
		}
	}

	/**
	 * Create a copy of this index which can be mutated without affecting this one.
	 */
	public clone(context: EditableTreeContext): NodeKeyIndex {
		const indexClone = new NodeKeyIndex(this.fieldKey);
		indexClone.scanKeys(context);
		return indexClone;
	}

	// #region ReadonlyMap interface
	public forEach(
		callbackfn: (
			value: EditableTree,
			key: LocalNodeKey,
			map: ReadonlyMap<LocalNodeKey, EditableTree>,
		) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: LocalNodeKey): EditableTree | undefined {
		return this.nodes.get(key);
	}
	public has(key: LocalNodeKey): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[LocalNodeKey, EditableTree]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<LocalNodeKey> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<EditableTree> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[LocalNodeKey, EditableTree]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findKeys(node: EditableTree): Iterable<[key: LocalNodeKey, node: EditableTree]> {
		const key = node[localNodeKeySymbol];
		if (key !== undefined) {
			const field = node[typeSymbol].structFields.get(this.fieldKey);
			assert(field !== undefined, 0x6e2 /* Found node key that is not in schema */);
			assert(
				field.kind.identifier === FieldKinds.nodeKey.identifier,
				0x704 /* Found node key that is not in schema */,
			);
			assert(
				oneFromSet(field.types) === nodeKeyTreeIdentifier,
				0x705 /* Found node key that is not in schema */,
			);

			yield [key, node];
		} else {
			assert(
				!node[typeSymbol].structFields.has(this.fieldKey),
				0x6e3 /* Node key absent but required by schema */,
			);
		}

		for (const f of node) {
			for (let i = 0; i < f.length; i++) {
				yield* this.findKeys(f.getNode(i));
			}
		}
	}
}

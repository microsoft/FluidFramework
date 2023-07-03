/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { extractFromOpaque } from "../../util";
import { GlobalFieldKey, SchemaData } from "../../core";
import { nodeKey } from "../defaultFieldKinds";
import {
	EditableTree,
	EditableTreeContext,
	localNodeKeySymbol,
	typeSymbol,
} from "../editable-tree";
import { LocalNodeKey } from "./nodeKey";

/**
 * The node key index records nodes with {@link LocalNodeKey}s and allows them to be looked up by key.
 */
export class NodeKeyIndex<TField extends GlobalFieldKey>
	implements ReadonlyMap<LocalNodeKey, EditableTree>
{
	// TODO: The data structure that holds the nodes can likely be optimized to better support cloning
	private readonly nodes: Map<LocalNodeKey, EditableTree>;

	public constructor(
		public readonly fieldKey: TField,
		keys: Iterable<[LocalNodeKey, EditableTree]> = [],
	) {
		this.nodes = new Map(keys);
	}

	/**
	 * Returns true if the given schema contains the global node key field, otherwise false
	 */
	public static keysAreInSchema(schema: SchemaData, fieldKey: GlobalFieldKey): boolean {
		const fieldSchema = schema.globalFieldSchema.get(fieldKey);
		return fieldSchema !== undefined && fieldSchema.kind.identifier === nodeKey.identifier;
	}

	/**
	 * Search the tree for all nodes with keys, and record them in this index for lookup.
	 * This should be called each time the tree changes; each call to scan forgets all existing keys.
	 * @param context - the editable tree context in which to search for node keys
	 */
	// TODO: This can be optimized by responding to deltas/changes to the tree, rather than rescanning the whole tree every time
	public scanKeys(context: EditableTreeContext): void {
		if (NodeKeyIndex.keysAreInSchema(context.schema, this.fieldKey)) {
			this.nodes.clear();
			for (let i = 0; i < context.root.length; i++) {
				for (const [id, node] of this.findKeys(context.root.getNode(i))) {
					assert(!this.nodes.has(id), 0x6e1 /* Encountered duplicate node key */);
					this.nodes.set(id, node);
				}
			}
		}
	}

	/**
	 * Create a copy of this index which can be mutated without affecting this one.
	 */
	public clone(context: EditableTreeContext): NodeKeyIndex<TField> {
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
		const key = node[localNodeKeySymbol] as LocalNodeKey | undefined;
		if (key !== undefined) {
			yield [extractFromOpaque(key), node];
			assert(
				node[typeSymbol].extraGlobalFields ||
					node[typeSymbol].globalFields.has(this.fieldKey),
				0x6e2 /* Found node key that is not in schema */,
			);
		} else {
			assert(
				!node[typeSymbol].globalFields.has(this.fieldKey),
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

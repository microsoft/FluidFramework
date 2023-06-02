/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { isStableId } from "@fluidframework/container-runtime";
import { GlobalFieldKey, GlobalFieldKeySymbol, SchemaData, symbolFromKey } from "../core";
import { brand } from "../util";
import { EditableTree, EditableTreeContext, getField, typeSymbol } from "./editable-tree";
import { valueSymbol } from "./contextuallyTyped";
import { NodeIdentifier } from "./nodeIdentifier";
import { nodeIdentifier } from "./defaultFieldKinds";

/**
 * The identifier index allows nodes that have a special identifier field to be looked up via a query.
 */
export class NodeIdentifierIndex<TField extends GlobalFieldKey>
	implements ReadonlyMap<NodeIdentifier, EditableTree>
{
	private readonly identifierFieldKeySymbol: GlobalFieldKeySymbol;
	// TODO: The data structure that holds the nodes can likely be optimized to better support cloning
	private readonly nodes: Map<NodeIdentifier, EditableTree>;

	public constructor(
		public readonly identifierFieldKey: TField,
		identifiers: Iterable<[NodeIdentifier, EditableTree]> = [],
	) {
		this.identifierFieldKeySymbol = symbolFromKey(identifierFieldKey);
		this.nodes = new Map(identifiers);
	}

	/**
	 * Returns true if the given schema contains the global identifier field, otherwise false
	 */
	public static identifiersAreInSchema(
		schema: SchemaData,
		identifierFieldKey: GlobalFieldKey,
	): boolean {
		const fieldSchema = schema.globalFieldSchema.get(identifierFieldKey);
		return (
			fieldSchema !== undefined && fieldSchema.kind.identifier === nodeIdentifier.identifier
		);
	}

	/**
	 * Search the tree for all nodes with identifiers, and record them in this index for lookup.
	 * This should be called each time the tree changes; each call to scan forgets all existing identifiers.
	 * @param context - the editable tree context in which to search for identifiers
	 */
	// TODO: This can be optimized by responding to deltas/changes to the tree, rather than rescanning the whole tree every time
	public scanIdentifiers(context: EditableTreeContext): void {
		if (NodeIdentifierIndex.identifiersAreInSchema(context.schema, this.identifierFieldKey)) {
			this.nodes.clear();
			for (let i = 0; i < context.root.length; i++) {
				for (const [id, node] of this.findIdentifiers(context.root.getNode(i))) {
					assert(!this.nodes.has(id), 0x5c5 /* Encountered duplicate node identifier */);
					this.nodes.set(id, node);
				}
			}
		}
	}

	/**
	 * Create a copy of this index which can be mutated without affecting this one.
	 */
	public clone(context: EditableTreeContext): NodeIdentifierIndex<TField> {
		const indexClone = new NodeIdentifierIndex(this.identifierFieldKey);
		indexClone.scanIdentifiers(context);
		return indexClone;
	}

	// #region ReadonlyMap interface
	public forEach(
		callbackfn: (
			value: EditableTree,
			key: NodeIdentifier,
			map: ReadonlyMap<NodeIdentifier, EditableTree>,
		) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: NodeIdentifier): EditableTree | undefined {
		return this.nodes.get(key);
	}
	public has(key: NodeIdentifier): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[NodeIdentifier, EditableTree]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<NodeIdentifier> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<EditableTree> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[NodeIdentifier, EditableTree]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findIdentifiers(
		node: EditableTree,
	): Iterable<[identifier: NodeIdentifier, node: EditableTree]> {
		if (this.identifierFieldKeySymbol in node) {
			const type = node[typeSymbol];
			if (type.extraGlobalFields || type.globalFields.has(this.identifierFieldKey)) {
				// Get the ID via a wrapped node rather than an unwrapped node (`node[identifierFieldKeySymbol]`)
				// so that the field kind can be checked
				const field = node[getField](this.identifierFieldKeySymbol);
				if (field.fieldSchema.kind.identifier === nodeIdentifier.identifier) {
					const identifierNode = field.getNode(0);
					const id = identifierNode[valueSymbol];
					assert(
						typeof id === "string" && isStableId(id),
						0x6b4 /* Malformed value encountered in identifier field */,
					);
					yield [brand(id), node];
				}
			}
		}

		for (const f of node) {
			for (let i = 0; i < f.length; i++) {
				yield* this.findIdentifiers(f.getNode(i));
			}
		}
	}
}

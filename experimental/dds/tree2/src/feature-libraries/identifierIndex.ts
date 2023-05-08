/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	GlobalFieldKey,
	GlobalFieldKeySymbol,
	SchemaData,
	symbolFromKey,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../core";
import { compareSets } from "../util";
import { EditableTree, EditableTreeContext, getField, typeSymbol } from "./editable-tree";
import { SchemaBuilder } from "./modular-schema";
import { valueSymbol } from "./contextuallyTyped";

const builder = new SchemaBuilder("Identifier Domain");

/**
 * The primitive type used as an identifier
 * @alpha
 */
// TODO: This type will replaced with the CompressedId type from the IdCompressor, when available in the runtime
// TODO: This us unsafe since "unknown" can contain other types of numbers.
export type Identifier = number;
function isIdentifier(id: unknown | Identifier): id is Identifier {
	return typeof id === "number";
}

/**
 * The tree schema for the identifier primitive
 */
export const identifierSchema = builder.primitive("identifier", ValueSchema.Number);

/**
 * The field schema for fields which contain identifiers (see {@link identifierSchema})
 */
export const identifierFieldSchema = builder.globalField(
	"identifier",
	SchemaBuilder.fieldValue(identifierSchema),
);

export const identifierFieldSchemaLibrary = builder.intoLibrary();

/**
 * The identifier index allows nodes that have a special identifier field to be looked up via a query.
 */
export class IdentifierIndex<TField extends GlobalFieldKey>
	implements ReadonlyMap<Identifier, EditableTree>
{
	private readonly identifierFieldKeySymbol: GlobalFieldKeySymbol;
	// TODO: The data structure that holds the nodes can likely be optimized to better support cloning
	private readonly nodes: Map<Identifier, EditableTree>;

	public constructor(
		private readonly identifierFieldKey: TField,
		identifiers: Iterable<[Identifier, EditableTree]> = [],
	) {
		this.identifierFieldKeySymbol = symbolFromKey(identifierFieldKey);
		this.nodes = new Map(identifiers);
	}

	/**
	 * Returns true if the given schema contains the global identifier field, otherwise false
	 */
	public identifiersAreInSchema(schema: SchemaData): boolean {
		const fieldSchema = schema.globalFieldSchema.get(this.identifierFieldKey);
		if (fieldSchema === undefined) {
			return false;
		}

		// TODO: is there a better way to check "the field schema is `identifierFieldSchema`"?
		{
			if (fieldSchema.kind.identifier !== identifierFieldSchema.schema.kind.identifier) {
				return false;
			}

			if (fieldSchema.types === undefined) {
				return false;
			}

			return compareSets({
				a: fieldSchema.types,
				b: identifierFieldSchema.schema.types as ReadonlySet<TreeSchemaIdentifier>,
			});
		}
	}

	/**
	 * Search the tree for all nodes with identifiers, and record them in this index for lookup.
	 * This should be called each time the tree changes; each call to scan forgets all existing identifiers.
	 * @param context - the editable tree context in which to search for identifiers
	 */
	// TODO: This can be optimized by responding to deltas/changes to the tree, rather than rescanning the whole tree every time
	public scanIdentifiers(context: EditableTreeContext): void {
		if (this.identifiersAreInSchema(context.schema)) {
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
	public clone(context: EditableTreeContext): IdentifierIndex<TField> {
		const indexClone = new IdentifierIndex(this.identifierFieldKey);
		indexClone.scanIdentifiers(context);
		return indexClone;
	}

	// #region ReadonlyMap interface
	public forEach(
		callbackfn: (
			value: EditableTree,
			key: Identifier,
			map: ReadonlyMap<Identifier, EditableTree>,
		) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: Identifier): EditableTree | undefined {
		return this.nodes.get(key);
	}
	public has(key: Identifier): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[Identifier, EditableTree]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<Identifier> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<EditableTree> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[Identifier, EditableTree]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findIdentifiers(
		node: EditableTree,
	): Iterable<[identifier: Identifier, node: EditableTree]> {
		if (this.identifierFieldKeySymbol in node) {
			const type = node[typeSymbol];
			if (type.extraGlobalFields || type.globalFields.has(this.identifierFieldKey)) {
				// Get the ID via a wrapped node rather than an unwrapped node (`node[identifierFieldKeySymbol]`)
				// so that the length of the field and the type of the value can be validated as correct
				const field = node[getField](this.identifierFieldKeySymbol);
				if (field.length >= 1) {
					const identifierNode = field.getNode(0);
					const id = identifierNode[valueSymbol];
					if (isIdentifier(id)) {
						yield [id, node];
					}
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

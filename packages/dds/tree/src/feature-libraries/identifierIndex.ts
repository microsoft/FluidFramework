/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GlobalFieldKey, GlobalFieldKeySymbol, symbolFromKey, ValueSchema } from "../core";
import { compareSets } from "../util";
import { EditableTree, EditableTreeContext, typeSymbol } from "./editable-tree";
import { TypedSchema } from "./modular-schema";
import { value as valueFieldKind } from "./defaultFieldKinds";

export type IdentifiedNode<_TField extends GlobalFieldKey> = EditableTree;

export const identifierSchema = TypedSchema.tree("identifier", { value: ValueSchema.String });
export const identifierFieldSchema = TypedSchema.field(valueFieldKind, identifierSchema);

export class IdentifierIndex<TField extends GlobalFieldKey>
	implements ReadonlyMap<string, IdentifiedNode<TField>>
{
	private readonly identifierFieldKeySymbol: GlobalFieldKeySymbol;

	public constructor(
		private readonly context: EditableTreeContext,
		private readonly identifierFieldKey: TField,
		private readonly nodes = new Map<string, IdentifiedNode<TField>>(),
	) {
		this.identifierFieldKeySymbol = symbolFromKey(identifierFieldKey);
	}

	public applyDelta(): void {
		// TODO: make this more efficient
		this.loadIdentifiers();
	}

	public applySchema(): void {}

	private loadIdentifiers(): void {
		if (this.identifiersAreInSchema()) {
			this.nodes.clear();
			for (let i = 0; i < this.context.root.length; i++) {
				for (const [id, node] of this.findIdentifiers(this.context.root.getNode(i))) {
					this.nodes.set(id, node);
				}
			}
		}
	}

	public clone(context: EditableTreeContext): IdentifierIndex<TField> {
		return new IdentifierIndex(context, this.identifierFieldKey, new Map(this.nodes.entries()));
	}

	// #region ReadonlyMap interface
	public forEach(
		callbackfn: (
			value: IdentifiedNode<TField>,
			key: string,
			map: ReadonlyMap<string, IdentifiedNode<TField>>,
		) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: string): IdentifiedNode<TField> | undefined {
		return this.nodes.get(key);
	}
	public has(key: string): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[string, IdentifiedNode<TField>]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<string> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<IdentifiedNode<TField>> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[string, IdentifiedNode<TField>]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findIdentifiers(
		node: EditableTree,
	): Iterable<[identifier: string, node: IdentifiedNode<TField>]> {
		if (this.identifierFieldKeySymbol in node) {
			const type = node[typeSymbol];
			if (type.extraGlobalFields || type.globalFields.has(this.identifierFieldKey)) {
				const id = node[this.identifierFieldKeySymbol];
				if (typeof id === "string") {
					yield [id, node];
				}
			}
		}

		for (const f of node) {
			for (let i = 0; i < f.length; i++) {
				yield* this.findIdentifiers(f.getNode(i));
			}
		}
	}

	private identifiersAreInSchema(): boolean {
		const fieldSchema = this.context.schema.globalFieldSchema.get(this.identifierFieldKey);
		if (fieldSchema === undefined) {
			return false;
		}

		if (fieldSchema.kind !== identifierFieldSchema.kind) {
			return false;
		}

		if (fieldSchema.types === undefined) {
			return false;
		}

		return compareSets({ a: fieldSchema.types, b: identifierFieldSchema.types });
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, GlobalFieldKeySymbol } from "../core";
import { valueSymbol } from "./contextuallyTyped";
import { EditableTree, EditableTreeContext } from "./editable-tree";

export type IdentifiedNode<TField extends GlobalFieldKeySymbol> = EditableTree &
	Record<TField, EditableTree>;

export class IdentifierIndex<TId, TField extends GlobalFieldKeySymbol>
	implements ReadonlyMap<TId, IdentifiedNode<TField>>
{
	public constructor(
		private readonly context: EditableTreeContext,
		private readonly identifierFieldKey: TField,
		private readonly isId: (x: TId | unknown) => x is TId,
		private readonly compareIds: (a: TId, b: TId) => number,
		private readonly nodes = new Map<TId, IdentifiedNode<TField>>(),
	) {}

	public applyDelta(_: Delta.Root): void {
		this.nodes.clear();
		for (let i = 0; i < this.context.root.length; i++) {
			for (const [id, node] of this.findIdentifiers(this.context.root.getNode(i))) {
				this.nodes.set(id, node);
			}
		}
	}

	public clone(context: EditableTreeContext): IdentifierIndex<TId, TField> {
		return new IdentifierIndex(
			context,
			this.identifierFieldKey,
			this.isId,
			this.compareIds,
			new Map(this.nodes.entries()),
		);
	}

	// #region ReadonlyMap interface
	public forEach(
		callbackfn: (
			value: IdentifiedNode<TField>,
			key: TId,
			map: ReadonlyMap<TId, IdentifiedNode<TField>>,
		) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: TId): IdentifiedNode<TField> | undefined {
		return this.nodes.get(key);
	}
	public has(key: TId): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[TId, IdentifiedNode<TField>]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<TId> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<IdentifiedNode<TField>> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[TId, IdentifiedNode<TField>]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findIdentifiers(
		node: EditableTree,
	): Iterable<[identifier: TId, node: IdentifiedNode<TField>]> {
		if (this.identifierFieldKey in node) {
			const nodeWithIdentifier = node as IdentifiedNode<TField>;
			const id = nodeWithIdentifier[this.identifierFieldKey][valueSymbol];
			if (this.isId(id)) {
				yield [id, nodeWithIdentifier];
			}
		}

		for (const f of node) {
			for (let i = 0; i < f.length; i++) {
				yield* this.findIdentifiers(f.getNode(i));
			}
		}
	}
}

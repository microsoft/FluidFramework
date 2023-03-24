/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, FieldKey } from "../core";
import { EditableTree, EditableTreeContext, getField } from "./editable-tree";

export class IdentifierIndex<TId, TIdentifierFieldKey extends FieldKey>
	implements ReadonlyMap<TId, EditableTree>
{
	public constructor(
		private readonly context: EditableTreeContext,
		private readonly identifierFieldKey: TIdentifierFieldKey,
		private readonly isId: (x: TId | unknown) => x is TId,
		private readonly compareIds: (a: TId, b: TId) => number,
		private readonly nodes = new Map<TId, EditableTree>(),
	) {}

	public applyDelta(_: Delta.Root): void {
		this.nodes.clear();
		for (let i = 0; i < this.context.root.length; i++) {
			for (const [id, node] of this.findIdentifiers(this.context.root.getNode(i))) {
				this.nodes.set(id, node);
			}
		}
	}

	public clone(context: EditableTreeContext): IdentifierIndex<TId, TIdentifierFieldKey> {
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
		callbackfn: (value: EditableTree, key: TId, map: ReadonlyMap<TId, EditableTree>) => void,
		thisArg?: any,
	): void {
		return this.nodes.forEach(callbackfn, thisArg);
	}
	public get(key: TId): EditableTree | undefined {
		return this.nodes.get(key);
	}
	public has(key: TId): boolean {
		return this.nodes.has(key);
	}
	public get size(): number {
		return this.nodes.size;
	}
	public entries(): IterableIterator<[TId, EditableTree]> {
		return this.nodes.entries();
	}
	public keys(): IterableIterator<TId> {
		return this.nodes.keys();
	}
	public values(): IterableIterator<EditableTree> {
		return this.nodes.values();
	}
	public [Symbol.iterator](): IterableIterator<[TId, EditableTree]> {
		return this.nodes[Symbol.iterator]();
	}
	// #endregion ReadonlyMap interface

	private *findIdentifiers(node: EditableTree): Iterable<[identifier: TId, node: EditableTree]> {
		const identifierField = node[getField](this.identifierFieldKey);
		for (const id of identifierField) {
			if (this.isId(id)) {
				yield [id, node];
			}
		}

		for (const f of node) {
			for (let n = 0; n < f.length; n++) {
				yield* this.findIdentifiers(f.getNode(n));
			}
		}
	}
}

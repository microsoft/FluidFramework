/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Change,
	ChangeNode,
	NodeId,
	SharedTree,
	StablePlace,
	StableRange,
	TraitLabel,
} from "@fluid-experimental/tree";
import { Serializable } from "@fluidframework/datastore-definitions/legacy";

import { NodeKind, fromJson } from "./treeutils.js";

function getChild(
	tree: SharedTree,
	nodeId: NodeId,
	update: (...change: Change[]) => void,
): unknown {
	const view = tree.currentView;
	const node = view.getViewNode(nodeId);
	switch (node.definition) {
		case NodeKind.scalar:
			return node.payload;
		case NodeKind.array: {
			return new TreeArrayProxy(tree, nodeId, update);
		}
		default:
			return TreeObjectProxy(tree, nodeId, update);
	}
}

// eslint-disable-next-line @typescript-eslint/ban-types
export const TreeObjectProxy = <T extends Object>(
	tree: SharedTree,
	nodeId: NodeId,
	update: (...change: Change[]) => void,
): T =>
	new Proxy<T>({} as unknown as T, {
		get(_target, key) {
			const view = tree.currentView;
			const childrenIds = view.getTrait({ parent: nodeId, label: key as TraitLabel });
			return getChild(tree, childrenIds[0], update);
		},
		set(_target, key, value) {
			const view = tree.currentView;
			const childrenIds = view.getTrait({ parent: nodeId, label: key as TraitLabel });
			if (childrenIds.length === 0) {
				update(
					...Change.insertTree(
						[fromJson(tree, value)],
						StablePlace.atEndOf({ parent: nodeId, label: key as TraitLabel }),
					),
				);
				return true;
			} else {
				const childId = childrenIds[0];
				const child = view.getViewNode(childId);

				if (child.definition === NodeKind.scalar) {
					update(Change.setPayload(childId, value));
					return true;
				}
			}

			return false;
		},
		// ownKeys(target) {
		//     const view = tree.currentView;
		//     return Reflect.ownKeys(view.getSnapshotNode(nodeId).traits);
		// },
		// getOwnPropertyDescriptor(target, key) {
		//     // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		//     return { configurable: true, enumerable: true, value: this.get!(target, key, target) };
		// },
	});

export class TreeArrayProxy<T> {
	constructor(
		private readonly tree: SharedTree,
		private readonly nodeId: NodeId,
		private readonly update: (...change: Change[]) => void,
	) {
		const handler: ProxyHandler<TreeArrayProxy<T>> = {
			get(target, key) {
				if (typeof key !== "symbol" && !isNaN(key as unknown as number)) {
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
					const index = parseInt(key as string, 10);
					const view = tree.currentView;
					const childrenIds = view.getTrait({
						parent: nodeId,
						label: "items" as TraitLabel,
					});
					return getChild(tree, childrenIds[index], update);
				}

				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return target[key];
			},
			set(target, key, value) {
				if (typeof key !== "symbol" && !isNaN(key as unknown as number)) {
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
					const index = parseInt(key as string, 10);
					const view = tree.currentView;
					const childrenIds = view.getTrait({
						parent: nodeId,
						label: "items" as TraitLabel,
					});
					update(
						...Change.insertTree(
							[fromJson(tree, value)],
							StablePlace.after(view.getViewNode(childrenIds[index])),
						),
						Change.delete(StableRange.only(view.getViewNode(childrenIds[index]))),
					);
					return true;
				}

				return false;
			},
		};
		return new Proxy(this, handler);
	}

	[n: number]: Serializable<T>;

	private get itemIds(): readonly NodeId[] {
		const view = this.tree.currentView;
		return view.getTrait({ parent: this.nodeId, label: "items" as TraitLabel });
	}

	private idsToItems(itemIds: readonly NodeId[]) {
		return itemIds.map((itemId) =>
			getChild(this.tree, itemId, this.update),
		) as Serializable<T>[];
	}

	private get items(): Serializable<T>[] {
		return this.idsToItems(this.itemIds);
	}
	get length(): number {
		return this.items.length;
	}

	[Symbol.iterator](): IterableIterator<Serializable<T>> {
		return this.items[Symbol.iterator]();
	}

	toString(): string {
		return this.items.toString();
	}
	toLocaleString(): string {
		return this.items.toLocaleString();
	}

	pop(): Serializable<T> | undefined {
		const itemIds = this.itemIds;
		if (itemIds.length === 0) {
			return undefined;
		}

		const removedId = itemIds[itemIds.length - 1];
		const removed = getChild(this.tree, removedId, this.update);
		this.update(Change.delete(StableRange.only(this.tree.currentView.getViewNode(removedId))));
		return removed as Serializable<T>;
	}

	push(...item: Serializable<T>[]): number {
		this.update(
			...Change.insertTree(
				item.map((child: Serializable<T>): ChangeNode => fromJson(this.tree, child)),
				StablePlace.atEndOf({
					parent: this.nodeId,
					label: "items" as TraitLabel,
				}),
			),
		);

		return this.items.length;
	}

	pushNode(...node: ChangeNode[]) {
		this.update(
			...Change.insertTree(
				node,
				StablePlace.atEndOf({
					parent: this.nodeId,
					label: "items" as TraitLabel,
				}),
			),
		);
	}

	map<U>(
		callbackfn: (value: Serializable<T>, index: number, array: Serializable<T>[]) => U,
		thisArg?: any,
	): U[] {
		return this.items.map<U>(callbackfn, thisArg);
	}
}

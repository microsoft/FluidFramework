/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Change,
    Delete,
    EditNode,
    Insert,
    NodeId,
    SharedTree,
    StablePlace,
    StableRange,
    TraitLabel,
} from "@fluid-experimental/tree";
import { fromJson, NodeKind } from "../treeutils";

function getChild(tree: SharedTree, nodeId: NodeId, update: (...change: Change[]) => void): unknown {
    const view = tree.currentView;
    const node = view.getSnapshotNode(nodeId);
    switch (node.definition) {
        case NodeKind.scalar:
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return JSON.parse(node.payload!.base64);
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
): T => new Proxy<T>({} as unknown as T, {
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
                    ...Insert.create(
                        [fromJson(value)],
                        StablePlace.atEndOf({ parent: nodeId, label: key as TraitLabel })));
                return true;
            } else {
                const childId = childrenIds[0];
                const child = view.getSnapshotNode(childId);

                if (child.definition === NodeKind.scalar) {
                    update(Change.setPayload(childId, { base64: JSON.stringify(value) }));
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

export class TreeArrayProxy<T> /* , Array<T> */ {
    constructor(
        private readonly tree: SharedTree,
        private readonly nodeId: NodeId,
        private readonly update: (...change: Change[]) => void,
    ) {
        return new Proxy(this, {
            get(target, key) {
                if (typeof key !== "symbol" && !isNaN(key as number)) {
                    const index = parseInt(key as string, 10);
                    const view = tree.currentView;
                    const childrenIds = view.getTrait({ parent: nodeId, label: "items" as TraitLabel });
                    return getChild(tree, childrenIds[index], update);
                }

                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return target[key];
            },
            set(target, key, value) {
                if (typeof key !== "symbol" && !isNaN(key as number)) {
                    const index = parseInt(key as string, 10);
                    const view = tree.currentView;
                    const childrenIds = view.getTrait({ parent: nodeId, label: "items" as TraitLabel });
                    update(
                        ...Insert.create(
                            [fromJson(value)],
                            StablePlace.after(view.getChangeNode(childrenIds[index]))),
                        Delete.create(StableRange.only(view.getChangeNode(childrenIds[index]))));
                    return true;
                }

                return false;
            },
        });
    }

    [n: number]: T;

    private get itemIds(): readonly NodeId[] {
        const view = this.tree.currentView;
        return view.getTrait({ parent: this.nodeId, label: "items" as TraitLabel });
    }

    private idsToItems(itemIds: readonly NodeId[]) {
        return itemIds.map((itemId) => getChild(this.tree, itemId, this.update)) as T[];
    }

    get items(): readonly T[] { return this.idsToItems(this.itemIds); }

    get length(): number { return this.items.length; }

    [Symbol.iterator](): IterableIterator<T> { return this.items[Symbol.iterator](); }

    toString(): string { return this.items.toString(); }
    toLocaleString(): string { return this.items.toLocaleString(); }

    pop(): T | undefined {
        const itemIds = this.itemIds;
        if (itemIds.length === 0) {
            return undefined;
        }

        const removedId = itemIds[itemIds.length - 1];
        const removed = getChild(this.tree, removedId, this.update);
        this.update(Delete.create(StableRange.only(this.tree.currentView.getChangeNode(removedId))));
        return removed as T;
    }

    pushNode(...node: EditNode[]) {
        this.update(
            ...Insert.create(
                node, StablePlace.atEndOf({
                    parent: this.nodeId,
                    label: "items" as TraitLabel })));
    }

    map<U>(callbackfn: (value: T, index: number, array: readonly T[]) => U, thisArg?: any): U[] {
        return this.items.map<U>(callbackfn, thisArg);
    }
}

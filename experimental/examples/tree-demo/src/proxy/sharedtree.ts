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

    // concat(...items: ConcatArray<T>[]): T[];
    // concat(...items: (T | ConcatArray<T>)[]): T[];
    // concat(...items?: any[]) {
    //     return this.items.concat(...items?: any[]);
    // }
    // join(separator?: string): string {
    //     return this.items.join(separator?: string): string;
    // }
    // reverse(): T[] {
    //     return this.items.reverse(): T[];
    // }
    // shift(): T | undefined {
    //     return this.items.shift(): T | undefined;
    // }
    // slice(start?: number, end?: number): T[] {
    //     return this.items.slice(start?: number, end?: number): T[];
    // }
    // sort(compareFn?: (a: T, b: T) => number): this {
    //     return this.items.sort(compareFn?: (a: T, b: T) => number): this;
    // }
    // splice(start: number, deleteCount?: number): T[];
    // splice(start: number, deleteCount: number, ...items: T[]): T[];
    // splice(start: any, deleteCount?: any, ...rest?: any[]) {
    //     return this.items.splice(start: any, deleteCount?: any, ...rest?: any[]);
    // }
    // unshift(...items: T[]): number {
    //     return this.items.unshift(...items: T[]): number;
    // }
    // indexOf(searchElement: T, fromIndex?: number): number {
    //     return this.items.indexOf(searchElement: T, fromIndex?: number): number;
    // }
    // lastIndexOf(searchElement: T, fromIndex?: number): number {
    //     return this.items.lastIndexOf(searchElement: T, fromIndex?: number): number;
    // }
    // every<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): this is S[];
    // every(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
    // every(predicate: any, thisArg?: any) {
    //     return this.items.every(predicate: any, thisArg?: any);
    // }
    // some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean {
    //     return this.items.some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
    // }
    // forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void {
    //     return this.items.forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
    // }

    map<U>(callbackfn: (value: T, index: number, array: readonly T[]) => U, thisArg?: any): U[] {
        return this.items.map<U>(callbackfn, thisArg);
    }

    // filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
    // filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];
    // filter(predicate: any, thisArg?: any) {
    //     return this.items.filter(predicate: any, thisArg?: any);
    // }
    // reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
    // reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
    // reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
    // reduce(callbackfn: any, initialValue?: any) {
    //     return this.items.reduce(callbackfn: any, initialValue?: any);
    // }
    // reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
    // reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
    // reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
    // reduceRight(callbackfn: any, initialValue?: any) {
    //     return this.items.reduceRight(callbackfn: any, initialValue?: any);
    // }
    // find<S extends T>(predicate: (this: void, value: T, index: number, obj: T[]) => value is S, thisArg?: any): S | undefined;
    // find(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined;
    // find(predicate: any, thisArg?: any) {
    //     return this.items.find(predicate: any, thisArg?: any);
    // }
    // findIndex(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): number {
    //     return this.items.findIndex(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): number;
    // }
    // fill(value: T, start?: number, end?: number): this {
    //     return this.items.fill(value: T, start?: number, end?: number): this;
    // }
    // copyWithin(target: number, start: number, end?: number): this {
    //     return this.items.copyWithin(target: number, start: number, end?: number): this;
    // }
    // [Symbol.iterator](): IterableIterator<T> {
    //     return this.items.[Symbol.iterator](): IterableIterator<T>;
    // }
    // entries(): IterableIterator<[number, T]> {
    //     return this.items.entries(): IterableIterator<[number, T]>;
    // }
    // keys(): IterableIterator<number> {
    //     return this.items.keys(): IterableIterator<number>;
    // }
    // values(): IterableIterator<T> {
    //     return this.items.values(): IterableIterator<T>;
    // }
    // [Symbol.unscopables](): { copyWithin: boolean; entries: boolean; fill: boolean; find: boolean; findIndex: boolean; keys: boolean; values: boolean; } {
    //     return this.items.[Symbol.unscopables](): { copyWithin: boolean; entries: boolean; fill: boolean; find: boolean; findIndex: boolean; keys: boolean; values: boolean; };
    // }
    // includes(searchElement: T, fromIndex?: number): boolean {
    //     return this.items.includes(searchElement: T, fromIndex?: number): boolean;
    // }
    // flatMap<U, This = undefined>(callback: (this: This, value: T, index: number, array: T[]) => U | readonly U[], thisArg?: This): U[] {
    //     return this.items.flatMap<U, This = undefined>(callback: (this: This, value: T, index: number, array: T[]) => U | readonly U[], thisArg?: This): U[];
    // }
    // flat<A, D extends number = 1>(this: A, depth?: D): FlatArray<A, D>[] {
    //     return this.items.flat<A, D extends number = 1>(this: A, depth?: D): FlatArray<A, D>[];
    // }
}

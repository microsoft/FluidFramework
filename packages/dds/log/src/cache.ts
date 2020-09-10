/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const blockSize = 256 as const;

type InteriorNode<T> = InteriorNode<T>[] | LeafNode<T>[];
type LeafNode<T> = T[];
type LogNode<T> = InteriorNode<T> | LeafNode<T>;

export class LogCache<T> {
    private building: LeafNode<T> = [];
    private cache: LogNode<T> = this.building;
    private height = 1;
    private _length = 0;

    public get length() {
        return this._length;
    }

    public append(entry: T) {
        const { building } = this;
        building.push(entry);
        this._length++;

        if (this.building.length === blockSize) {
            this.building = [];
            const maybeChild = this.insert(this.cache, this.height, this.building);
            if (maybeChild !== undefined) {
                this.cache = [this.cache, maybeChild] as InteriorNode<T>;
                this.height++;
            }
        }
    }

    private insert(
        parent: LogNode<T>,
        depth: number,
        leaf: LeafNode<T>,
    ): LogNode<T> | undefined {
        // eslint-disable-next-line no-param-reassign
        if (--depth === 0) {
            if (parent.length === blockSize) {
                return leaf;
            }
            parent.push(leaf as any);
        } else {
            const lastChild = parent[parent.length - 1];
            const maybeChild = this.insert(lastChild as InteriorNode<T>, depth, leaf);
            if (maybeChild !== undefined) {
                if (parent.length === blockSize) {
                    return [maybeChild] as InteriorNode<T>;
                }
                parent.push(maybeChild as any);
            }
        }

        return undefined;
    }

    public forEach(callback: (value, index) => void) {
        this.visit(this.cache, /* depth: */ this.height, /* index: */ 0, callback);
    }

    private visit(
        parent: InteriorNode<T> | LeafNode<T>,
        depth: number,
        index: number,
        callback: (value, index) => void,
    ) {
        // eslint-disable-next-line no-param-reassign
        if (--depth === 0) {
            for (const entry of parent) {
                callback(entry, index);
                // eslint-disable-next-line no-param-reassign
                index++;
            }
        } else {
            for (const child of parent) {
                // eslint-disable-next-line no-param-reassign
                index = this.visit(child as InteriorNode<T>, depth, index, callback);
            }
        }

        return index;
    }
}

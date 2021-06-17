/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for a comparere
 */
export interface IComparer<T> {
    /**
     * The minimum value of type T
     */
    min: T;

    /**
     * Compare the two value
     *
     * @returns 0 if the value is equal, negative number if a is smaller then b, positive number otherwise
     */
    compare(a: T, b: T): number;
}

/**
 * A comparer for numbers
 */
export const NumberComparer: IComparer<number> = {
    /**
     * The compare function for numbers,
     * @returns difference of the two number
     */
    compare: (a, b) => a - b,

    /**
     * The minimum value of a javascript number, which is Number.MIN_VALUE
     */
    min: Number.MIN_VALUE,
};

/**
 * Interface to a node in Heap
 */
export interface IHeapNode<T> {
    value: T;
    position: number;
}

/**
 * Ordered Heap data structure implementation
 */
export class Heap<T> {
    private L: IHeapNode<T>[];

    /**
     * Creates an instance of Heap with comparer
     * @param comp - a comparer that specify how elements are ordered
     */
    constructor(public comp: IComparer<T>) {
        this.L = [{ value: comp.min, position: 0 }];
    }

    /**
     * Return the smallest element in the heap as determined by the order of the comparer
     *
     * @returns heap node containing the smallest element
     */
    public peek(): IHeapNode<T> {
        return this.L[1];
    }

    /**
     * Get and remove the smallest element in the heap as determined by the order of the comparer
     *
     * @returns the smallest value in the heap
     */
    public get(): T {
        this.swap(1, this.count());
        const x = this.L.pop();
        this.fixdown(1);
        return x!.value;
    }

    /**
     * Add a value to the heap
     *
     * @param x - value to add
     * @returns the heap node that contains the value
     */
    public add(x: T): IHeapNode<T> {
        const node = { value: x, position: this.L.length };
        this.L.push(node);
        this.fixup(this.count());

        return node;
    }

    /**
     * Allows for heap to be updated after a node's value changes
     */
    public update(node: IHeapNode<T>) {
        const k = node.position;
        if (this.isGreaterThanParent(k)) {
            this.fixup(k);
        } else {
            this.fixdown(k);
        }
    }

    /**
     * Removes the given node from the heap
     *
     * @param node - the node to remove from the heap
     */
    public remove(node: IHeapNode<T>) {
        // Move the node we want to remove to the end of the array
        const position = node.position;
        this.swap(node.position, this.L.length - 1);
        this.L.splice(this.L.length - 1);

        // Update the swapped node assuming we didn't remove the end of the list
        if (position !== this.L.length) {
            this.update(this.L[position]);
        }
    }

    /**
     * Get the number of elements in the Heap
     *
     * @returns the number of elements in the Heap
     */
    public count() {
        return this.L.length - 1;
    }

    private fixup(pos: number) {
        let k = pos;
        while (this.isGreaterThanParent(k)) {
            const parent = k >> 1;
            this.swap(k, parent);
            k = parent;
        }
    }

    private isGreaterThanParent(k: number): boolean {
        return k > 1 && (this.comp.compare(this.L[k >> 1].value, this.L[k].value) > 0);
    }

    private fixdown(pos: number) {
        let k = pos;
        while ((k << 1) <= this.count()) {
            let j = k << 1;
            if ((j < this.count()) && (this.comp.compare(this.L[j].value, this.L[j + 1].value) > 0)) {
                j++;
            }
            if (this.comp.compare(this.L[k].value, this.L[j].value) <= 0) {
                break;
            }
            this.swap(k, j);
            k = j;
        }
    }

    private swap(k: number, j: number) {
        const tmp = this.L[k];
        this.L[k] = this.L[j];
        this.L[k].position = k;
        this.L[j] = tmp;
        this.L[j].position = j;
    }
}

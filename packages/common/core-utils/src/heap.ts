/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for a comparer.
 * @internal
 */
export interface IComparer<T> {
	/**
	 * The minimum value of type T.
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
 * A comparer for numbers.
 * @internal
 */
export const NumberComparer: IComparer<number> = {
	/**
	 * The compare function for numbers.
	 * @returns The difference of the two numbers.
	 */
	compare: (a, b): number => a - b,

	/**
	 * The minimum value of a JavaScript number, which is `Number.MIN_VALUE`.
	 */
	min: Number.MIN_VALUE,
};

/**
 * Interface to a node in {@link Heap}.
 * @internal
 */
export interface IHeapNode<T> {
	value: T;
	position: number;
}

/**
 * Ordered {@link https://en.wikipedia.org/wiki/Heap_(data_structure) | Heap} data structure implementation.
 * @internal
 */
export class Heap<T> {
	private L: IHeapNode<T>[];

	/**
	 * Creates an instance of `Heap` with comparer.
	 * @param comp - A comparer that specify how elements are ordered.
	 */
	public constructor(public comp: IComparer<T>) {
		this.L = [{ value: comp.min, position: 0 }];
	}

	/**
	 * Return the smallest element in the heap as determined by the order of the comparer
	 *
	 * @returns Heap node containing the smallest element
	 */
	public peek(): IHeapNode<T> | undefined {
		return this.L[1];
	}

	/**
	 * Get and remove the smallest element in the heap as determined by the order of the comparer
	 *
	 * @returns The smallest value in the heap
	 */
	public get(): T | undefined {
		if (this.L.length === 0) {
			return undefined;
		}

		this.swap(1, this.count());
		const x = this.L.pop();
		this.fixdown(1);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return x!.value;
	}

	/**
	 * Add a value to the heap
	 *
	 * @param x - value to add
	 * @returns The heap node that contains the value
	 */
	public add(x: T): IHeapNode<T> {
		const node = { value: x, position: this.L.length };
		this.L.push(node);
		this.fixup(this.count());

		return node;
	}

	/**
	 * Allows for the Heap to be updated after a node's value changes.
	 */
	public update(node: IHeapNode<T>): void {
		const k = node.position;
		if (this.isGreaterThanParent(k)) {
			this.fixup(k);
		} else {
			this.fixdown(k);
		}
	}

	/**
	 * Removes the given node from the heap.
	 *
	 * @param node - The node to remove from the heap.
	 */
	public remove(node: IHeapNode<T>): void {
		// Move the node we want to remove to the end of the array
		const position = node.position;
		this.swap(node.position, this.L.length - 1);
		this.L.splice(-1);

		// Update the swapped node assuming we didn't remove the end of the list
		if (position !== this.L.length) {
			this.update(this.L[position]);
		}
	}

	/**
	 * Get the number of elements in the Heap.
	 *
	 * @returns The number of elements in the Heap.
	 */
	public count(): number {
		return this.L.length - 1;
	}

	private fixup(pos: number): void {
		let k = pos;
		while (this.isGreaterThanParent(k)) {
			// eslint-disable-next-line no-bitwise
			const parent = k >> 1;
			this.swap(k, parent);
			k = parent;
		}
	}

	private isGreaterThanParent(k: number): boolean {
		// eslint-disable-next-line no-bitwise
		return k > 1 && this.comp.compare(this.L[k >> 1].value, this.L[k].value) > 0;
	}

	private fixdown(pos: number): void {
		let k = pos;
		// eslint-disable-next-line no-bitwise
		while (k << 1 <= this.count()) {
			// eslint-disable-next-line no-bitwise
			let j = k << 1;
			if (j < this.count() && this.comp.compare(this.L[j].value, this.L[j + 1].value) > 0) {
				j++;
			}
			if (this.comp.compare(this.L[k].value, this.L[j].value) <= 0) {
				break;
			}
			this.swap(k, j);
			k = j;
		}
	}

	private swap(k: number, j: number): void {
		const tmp = this.L[k];
		this.L[k] = this.L[j];
		this.L[k].position = k;
		this.L[j] = tmp;
		this.L[j].position = j;
	}
}

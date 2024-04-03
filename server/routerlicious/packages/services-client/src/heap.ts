/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * compareFn for the heap.
 * @internal
 */
export interface IHeapComparator<T> {
	compareFn(a: T, b: T): number;
}

/**
 * Ordered {@link https://en.wikipedia.org/wiki/Heap_(data_structure) | Heap} data structure implementation.
 * @internal
 */
export class Heap<T> {
	private readonly heap: T[] = [];
	constructor(private readonly comparator: IHeapComparator<T>) {}

	public get size(): number {
		return this.heap.length;
	}

	public peek(): T | undefined {
		return this.heap[0];
	}

	public push(value: T): void {
		this.heap.push(value);
		this.bubbleUp(this.size - 1);
	}

	public pop(): T | undefined {
		if (this.size === 0) {
			return undefined;
		}
		const result = this.heap[0];
		const last = this.heap.pop();
		if (this.size > 0 && last !== undefined) {
			this.heap[0] = last;
			this.bubbleDown(0);
		}
		return result;
	}

	private bubbleUp(index: number): void {
		let current = index;
		while (current > 0) {
			const parent = Math.floor((current - 1) / 2);
			if (this.comparator.compareFn(this.heap[current], this.heap[parent]) >= 0) {
				break;
			}
			this.swap(current, parent);
			current = parent;
		}
	}

	private bubbleDown(index: number): void {
		let currentIndex = index;
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const left = currentIndex * 2 + 1;
			const right = currentIndex * 2 + 2;
			let smallestIndex = currentIndex;
			if (
				left < this.size &&
				this.comparator.compareFn(this.heap[left], this.heap[smallestIndex]) < 0
			) {
				smallestIndex = left;
			}
			if (
				right < this.size &&
				this.comparator.compareFn(this.heap[right], this.heap[smallestIndex]) < 0
			) {
				smallestIndex = right;
			}
			if (smallestIndex === currentIndex) {
				break;
			}
			this.swap(currentIndex, smallestIndex);
			currentIndex = smallestIndex;
		}
	}

	private swap(a: number, b: number): void {
		const temp = this.heap[a];
		this.heap[a] = this.heap[b];
		this.heap[b] = temp;
	}
}

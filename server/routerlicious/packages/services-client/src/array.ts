/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Heap } from "./heap";

/**
 * Converts the given number array into an array of ranges
 * Example: [1, 2, 3, 4, 5, 6] to [[1, 6]]
 * [1, 2, 3, 5, 6] to [[1,3],[5,6]]
 * @internal
 */
export function convertSortedNumberArrayToRanges(numberArray: number[]): number[][] {
	const ranges: number[][] = [];
	if (!numberArray?.length) {
		return ranges;
	}
	let begin: number = numberArray[0];
	let end: number = numberArray[0];
	for (let i = 1; i < numberArray.length; i++) {
		const elem = numberArray[i];
		if (elem - end !== 1) {
			ranges.push([begin, end]);
			begin = elem;
			end = elem;
		} else {
			end = elem;
		}
	}
	// Last range
	ranges.push([begin, end]);
	return ranges;
}

export function mergeArrays<T, TComp>(arr1: T[], arr2: T[], selector: (item: T) => TComp): T[] {
	const mergedResult: T[] = [];
	let index1 = 0;
	let index2 = 0;
	while (index1 < arr1.length && index2 < arr2.length) {
		const value1 = selector(arr1[index1]);
		const value2 = selector(arr2[index2]);
		if (value1 <= value2) {
			mergedResult.push(arr1[index1]);
			index1++;
		} else if (value1 > value2) {
			mergedResult.push(arr2[index2]);
			index2++;
		}
	}
	while (index1 < arr1.length) {
		mergedResult.push(arr1[index1]);
		index1++;
	}
	while (index2 < arr2.length) {
		mergedResult.push(arr2[index2]);
		index2++;
	}
	return mergedResult;
}

class HeapNode<T> {
	constructor(
		public readonly index: number,
		public readonly row: number,
		public readonly value: T,
	) {}
}

export function mergeKArrays<T>(arrays: T[][], comparator: (a: T, b: T) => number): T[] {
	const heapComparator = {
		compareFn: (a: HeapNode<T>, b: HeapNode<T>) => comparator(a.value, b.value),
	};
	const heap: Heap<HeapNode<T>> = new Heap<HeapNode<T>>(heapComparator);
	for (let i = 0; i < arrays.length; i++) {
		if (arrays[i].length > 0) {
			heap.push(new HeapNode<T>(0, i, arrays[i][0]));
		}
	}
	const mergedResult: T[] = [];
	while (heap.size > 0) {
		const node = heap.pop();
		mergedResult.push(node.value);
		const nextIndex = node.index + 1;
		if (nextIndex < arrays[node.row].length) {
			heap.push(new HeapNode<T>(nextIndex, node.row, arrays[node.row][nextIndex]));
		}
	}
	return mergedResult;
}

export function dedupeSortedArray<T, TSelector>(array: T[], selector: (item: T) => TSelector): T[] {
	const result: T[] = [];
	let pre: any;
	for (const item of array) {
		const key = selector(item);
		if (pre !== key) {
			result.push(item);
			pre = key;
		}
	}
	return result;
}

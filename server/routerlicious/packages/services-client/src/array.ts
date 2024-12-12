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

/**
 * Merge two already sorted array into one sorted array. Please make sure the comparator is consistent with the array sorting order.
 * Which means if the arrays were sorted in ascending order, the comparator should return a negative number if a &gt; b, 0 if a === b, and a positive number if a &lt; b.
 * While if the arrays were sorted in descending order, the comparator should return a positive number if a &lt; b, 0 if a === b, and a negative number if a &gt b.
 * @param arr1 - Sorted array 1
 * @param arr2 - Sorted array 2
 * @param comparator - comparator function, need to be consistent with the arrays sorting order
 * @returns merged sorted array based on the sorting order
 * @internal
 */
export function mergeSortedArrays<T>(
	arr1: T[],
	arr2: T[],
	comparator: (item1: T, item2: T) => number,
): T[] {
	const mergedResult: T[] = [];
	let index1 = 0;
	let index2 = 0;
	while (index1 < arr1.length && index2 < arr2.length) {
		const compareResult = comparator(arr1[index1], arr2[index2]);
		if (compareResult <= 0) {
			mergedResult.push(arr1[index1]);
			index1++;
		} else {
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

/**
 * Merge K sorted arrays into one sorted array. Please make sure the comparator is consistent with the array sorting order.
 * @param arrays - array of sorted arrays
 * @param comparator - comparator function, need to be consistent with the arrays sorting order
 * @returns merged sorted array based on the sorting order
 * @internal
 */
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
		if (node === undefined) {
			continue;
		}
		mergedResult.push(node.value);
		const nextIndex = node.index + 1;
		if (nextIndex < arrays[node.row].length) {
			heap.push(new HeapNode<T>(nextIndex, node.row, arrays[node.row][nextIndex]));
		}
	}
	return mergedResult;
}

/**
 * Dedupe the sorted array based on the selector. The array should be sorted based on the selector.
 * @param array - array to dedupe
 * @param selector - selector function
 * @returns deduped sorted array based on the selector
 * @internal
 */
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

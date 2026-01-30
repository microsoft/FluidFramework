/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugAssert } from "@fluidframework/core-utils/internal";
import { BTree, defaultComparator, type DefaultComparable } from "@tylerbu/sorted-btree-es6";

import { brand, type Brand } from "./brand.js";

/**
 * A BTree which uses tuples (arrays) as the key.
 * @remarks All keys must be the same length.
 */
export type TupleBTree<K extends readonly DefaultComparable[], V> = Brand<
	BTree<K, V>,
	"TupleBTree"
>;

/**
 * Create a new {@link TupleBTree}.
 * @param comparator - Either a single {@link TupleComparator | comparator} for all pairs of elements in the tuple or a {@link TupleComparators | tuple of comparators} that compares each pair of corresponding elements individually.
 * @param entries - Optional initial entries for the btree.
 */
export function newTupleBTree<const K extends readonly DefaultComparable[], V>(
	comparator: TupleComparator<K[number]> | TupleComparators<K> | undefined,
	entries?: [K, V][],
): TupleBTree<K, V> {
	return brand(new BTree<K, V>(entries, createTupleComparator(comparator)));
}

/** A comparator which can compare any pair of corresponding elements in the key of a {@link TupleBTree} */
type TupleComparator<T extends DefaultComparable> = (a: T, b: T) => number;

/**
 * A list of comparators for a {@link TupleBTree}.
 * @remarks For each comparator _C_ at index _i_, C compares the pair of corresponding elements at index _i_ in the key of the btree.
 */
type TupleComparators<T extends readonly DefaultComparable[]> = {
	[P in keyof T]: TupleComparator<T[P]>;
};

/**
 * Compares two tuples (arrays) element by element.
 * @param a - The first tuple to compare.
 * @param b - The second tuple to compare.
 * @returns The comparison of the first pair of elements at the same index that differ, or 0 if all elements are equal.
 * @remarks The tuples must be the same length and have the same type of elements in the same order.
 */
function createTupleComparator<const K extends readonly DefaultComparable[]>(
	compare: TupleComparator<K[number]> | TupleComparators<K> = defaultComparator,
): (a: K, b: K) => number {
	return (a: K, b: K): number => {
		debugAssert(
			() => a.length === b.length || "compareTuples requires arrays of the same length",
		);
		const comparators = typeof compare === "function" ? undefined : compare;
		for (let i = 0; i < a.length; i++) {
			const comparator = comparators?.[i] ?? (compare as TupleComparator<K[number]>);
			const result = comparator(a[i], b[i]);
			if (result !== 0) {
				return result;
			}
		}
		return 0;
	};
}

/**
 * Merge the entries of two {@link TupleBTree}s.
 * @param tree1 - The first btree.
 * @param tree2 - The second btree.
 * This always returns a new btree and does not modify either input.
 * @param preferLeft - If true, colliding keys will use the value from `tree1`, otherwise the value from `tree2` is used.
 */
export function mergeTupleBTrees<const K extends readonly DefaultComparable[], V>(
	tree1: TupleBTree<K, V>,
	tree2: TupleBTree<K, V> | undefined,
	preferLeft = true,
): TupleBTree<K, V> {
	const result: TupleBTree<K, V> = brand(tree1.clone());
	if (tree2 === undefined) {
		return result;
	}

	for (const [key, value] of tree2.entries()) {
		result.set(key, value, !preferLeft);
	}

	return result;
}

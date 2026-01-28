/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugAssert } from "@fluidframework/core-utils/internal";
import { BTree, defaultComparator, type DefaultComparable } from "@tylerbu/sorted-btree-es6";

import { brand, type Brand } from "./brand.js";

/**
 * A BTree which uses tuples (arrays) as the key.
 * @remarks
 * All keys must be the same length.
 */
export type TupleBTree<K extends readonly DefaultComparable[], V> = Brand<
	BTree<K, V>,
	"TupleBTree"
>;

/**
 * Create a new {@link TupleBTree}.
 */
export function newTupleBTree<const K extends readonly DefaultComparable[], V>(
	entries?: [K, V][],
): TupleBTree<K, V> {
	return brand(new BTree<K, V>(entries, compareTuples));
}

/**
 * Compares two tuples (arrays) element by element.
 * @param arrayA - The first tuple to compare.
 * @param arrayB - The second tuple to compare.
 * @returns A negative number if arrayA \< arrayB, a positive number if arrayA \> arrayB, or 0 if they are equal.
 */
function compareTuples(
	arrayA: readonly DefaultComparable[],
	arrayB: readonly DefaultComparable[],
): number {
	debugAssert(
		() =>
			arrayA.length === arrayB.length || "compareTuples requires arrays of the same length",
	);
	for (let i = 0; i < arrayA.length; i++) {
		const result = defaultComparator(arrayA[i], arrayB[i]);
		if (result !== 0) {
			return result;
		}
	}
	return 0;
}

export function mergeTupleBTrees<K extends readonly DefaultComparable[], V>(
	tree1: TupleBTree<K, V> | undefined,
	tree2: TupleBTree<K, V> | undefined,
	preferLeft = true,
): TupleBTree<K, V> {
	if (tree1 === undefined) {
		return tree2 === undefined ? newTupleBTree<K, V>() : brand(tree2.clone());
	}

	const result: TupleBTree<K, V> = brand(tree1.clone());
	if (tree2 === undefined) {
		return result;
	}

	for (const [key, value] of tree2.entries()) {
		result.set(key, value, !preferLeft);
	}

	return result;
}

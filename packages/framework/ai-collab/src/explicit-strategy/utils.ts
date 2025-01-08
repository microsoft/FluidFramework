/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Subset of Map interface.
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export interface MapGetSet<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
}

/**
 * TBD
 */
export function fail(message: string): never {
	throw new Error(message);
}

/**
 * Map one iterable to another by transforming each element one at a time
 * @param iterable - the iterable to transform
 * @param map - the transformation function to run on each element of the iterable
 * @returns a new iterable of elements which have been transformed by the `map` function
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export function* mapIterable<T, U>(
	iterable: Iterable<T>,
	map: (t: T) => U,
): IterableIterator<U> {
	for (const t of iterable) {
		yield map(t);
	}
}

/**
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export function getOrCreate<K, V>(
	map: MapGetSet<K, V>,
	key: K,
	defaultValue: (key: K) => V,
): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}

/**
 * Computes the Levenshtein distance between two strings.
 * The levenshtein distance between two strings is the minimum number of single-character edits (insertions, deletions, or substitutions) required to change one string into the other.
 */
export function levenshteinDistance(a: string, b: string): number {
	const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);

	for (let j = 1; j <= b.length; j++) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		dp[0][j] = j;
	}

	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			dp[i][j] = Math.min(
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				dp[i - 1][j] + 1, // Deletion
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				dp[i][j - 1] + 1, // Insertion
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				dp[i - 1][j - 1] + cost, // Substitution
			);
		}
	}
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return dp[a.length][b.length];
}

/**
 * Returns the closest match from a list of possibleMatches to the input string,
 * based on the smallest Levenshtein distance.
 *
 * @remarks this is intended to be used to help steer the LLM towards the correct field name if it attempts to use a field that does not exist on a given tree node.
 */
export function findClosestStringMatch(input: string, possibleMatches: string[]): string {
	let bestMatch = "";
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const candidate of possibleMatches) {
		const distance = levenshteinDistance(input, candidate);
		if (distance < bestDistance) {
			bestDistance = distance;
			bestMatch = candidate;
		}
	}
	return bestMatch;
}

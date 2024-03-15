/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	RangeMap,
	getFromRangeMap,
	RangeQueryResult,
	setInRangeMap,
	deleteFromRangeMap,
} from "./rangeMap.js";
import { getOrAddInMap } from "./nestedMap.js";

export type NestedRangeMap<K, V> = Map<K, RangeMap<V>>;

export interface IRange {
	start: number;
	length: number;
}

export function tryGetFromNestedRangeMap<K, V>(
	map: NestedRangeMap<K, V>,
	key: K,
	start: number,
	length: number,
): RangeQueryResult<V> | undefined {
	const innerMap = map.get(key);
	if (innerMap === undefined) {
		return undefined;
	}
	return getFromRangeMap<V>(innerMap, start, length);
}

export function setInNestedRangeMap<K, V>(
	map: NestedRangeMap<K, V>,
	key: K,
	start: number,
	length: number,
	value: V,
): void {
	const innerMap = getOrAddInMap(map, key, []);
	setInRangeMap(innerMap, start, length, value);
}

export function populateNestedRangeMap<K, V>(
	source: NestedRangeMap<K, V>,
	destination: NestedRangeMap<K, V>,
): void {
	for (const [key, inner] of source) {
		const newInner = [];
		newInner.push(...inner);

		destination.set(key, newInner);
	}
}

export function deleteFromNestedRangeMap<K, V>(
	map: NestedRangeMap<K, V>,
	key: K,
	start: number,
	length: number,
): boolean {
	const innerMap = getOrAddInMap(map, key, []);
	return deleteFromRangeMap(innerMap, start, length);
}

export function rangeToList(range: IRange): number[] {
	const result: number[] = [];

	for (let i = range.start; i < range.start + range.length; i++) {
		result.push(i);
	}

	return result;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Transform the values of a Map using the provided transform function.
 * @param map - The map to transform.
 * @param transformValue - A method for transforming values in the map.
 * @returns A new map with the transformed values.
 *
 * @internal
 */
export function transformMapValues<Key, InputValue, OutputValue>(
	map: ReadonlyMap<Key, InputValue>,
	transformValue: (value: InputValue, key: Key) => OutputValue,
): Map<Key, OutputValue> {
	return new Map([...map.entries()].map(([key, value]) => [key, transformValue(value, key)]));
}

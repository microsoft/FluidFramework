/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
	JsonTypeToOpaqueJson,
	OpaqueJsonDeserialized,
	OpaqueJsonSerializable,
	OpaqueJsonToJsonType,
} from "@fluidframework/core-interfaces/internal";

/**
 * Returns union of types of values in a record.
 */
export type RecordEntryTypes<T> = T[keyof T];

type MapNumberIndicesToStrings<T> = {
	[K in keyof T as K extends number ? `${K}` : K]: T[K];
};

type KeyValuePairs<T> = {
	[K in keyof MapNumberIndicesToStrings<Required<T>>]: [K, Required<T>[K]];
}[keyof MapNumberIndicesToStrings<Required<T>>][];

type RequiredAndNotUndefined<T> = {
	[K in keyof T]-?: Exclude<T[K], undefined>;
};

/**
 * Object.entries retyped to preserve known keys and their types.
 *
 * @privateRemarks
 * The is a defect in this utility when a string index appears in the object.
 * In such a case, the only result is `[string, T]`, where `T` is the type
 * of the string index entry.
 *
 * @internal
 */
export const objectEntries = Object.entries as <const T>(o: T) => KeyValuePairs<T>;

/**
 * Object.entries retyped to preserve known keys and their types.
 *
 * @remarks
 * Given `T` should not contain `undefined` values. If it does, use
 * {@link objectEntries} instead. Without `undefined` values, this
 * typing provides best handling of objects with optional properties.
 *
 * @internal
 */
export const objectEntriesWithoutUndefined = Object.entries as <const T>(
	o: T,
) => KeyValuePairs<RequiredAndNotUndefined<T>>;

/**
 * Object.keys retyped to preserve known keys and their types.
 *
 * @internal
 */
export const objectKeys = Object.keys as <const T>(
	o: T,
) => (keyof MapNumberIndicesToStrings<T>)[];

/**
 * Retrieve a value from a record with the given key, or create a new entry if
 * the key is not in the record.
 *
 * @param record - The record to index/update
 * @param key - The key to lookup in the record
 * @param defaultValue - a function which returns a default value. This is
 * called and used to set an initial value for the given key in the record if
 * none exists.
 * @returns either the existing value for the given key, or the newly-created
 * value (the result of `defaultValue`)
 */
export function getOrCreateRecord<const K extends string | number | symbol, const V>(
	record: Record<K, V>,
	key: K,
	defaultValue: (key: K) => V,
): V {
	if (!(key in record)) {
		record[key] = defaultValue(key);
	}
	return record[key];
}

/**
 * Do nothing helper to apply deep immutability to a value's type.
 */
export function asDeeplyReadonly<T>(value: T): DeepReadonly<T> {
	return value as DeepReadonly<T>;
}

/**
 * Cast a JSON value to an opaque version.
 *
 * @system
 */
export function toOpaqueJson<const T>(
	value: JsonSerializable<T> | JsonDeserialized<T>,
): JsonTypeToOpaqueJson<T> {
	return value as unknown as JsonTypeToOpaqueJson<T>;
}

/**
 * Cast an opaque JSON value back to its original version.
 *
 * @system
 */
export function fromOpaqueJson<
	const TOpaque extends OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>,
>(opaque: TOpaque): OpaqueJsonToJsonType<TOpaque> {
	return opaque as unknown as OpaqueJsonToJsonType<TOpaque>;
}

/**
 * Converts an opaque JSON value to a deeply readonly value.
 */
export function asDeeplyReadonlyFromOpaqueJson<
	const TOpaque extends OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>,
>(value: TOpaque): DeepReadonly<OpaqueJsonToJsonType<TOpaque>> {
	return asDeeplyReadonly(fromOpaqueJson(value));
}

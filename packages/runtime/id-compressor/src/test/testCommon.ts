/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { IdCompressor } from "../idCompressor.js";
import { OpSpaceCompressedId, SessionSpaceCompressedId, StableId } from "../index.js";
import {
	numericUuidFromStableId,
	offsetNumericUuid,
	stableIdFromNumericUuid,
} from "../utilities.js";

/**
 * An identifier (v4 UUID) that has been shortened by a distributed compression algorithm.
 * Lacks a space (session/op), meaning its scope is the same as the space-specific ID from which it was derived.
 */
export type CompressedId =
	| SessionSpaceCompressedId
	| OpSpaceCompressedId
	| FinalCompressedId
	| LocalCompressedId;

/**
 * A compressed ID that is stable and unique within the scope of network of compressors (i.e. a document).
 * It can only be used/decompressed in the context of the originating document.
 */
export type FinalCompressedId = number & {
	readonly FinalCompressedId: "5d83d1e2-98b7-4e4e-a889-54c855cfa73d";

	// Same brand as OpNormalizedCompressedId, as final IDs are always finally normalized
	readonly OpNormalized: "9209432d-a959-4df7-b2ad-767ead4dbcae";
};

/**
 * A compressed ID that is local to a session (can only be decompressed when paired with a SessionId).
 * Internally, it should not be persisted outside a scope annotated with the originating SessionId in order to be unambiguous.
 * If external persistence is needed (e.g. by a client), a StableId should be used instead.
 */
export type LocalCompressedId = number & {
	readonly LocalCompressedId: "6fccb42f-e2a4-4243-bd29-f13d12b9c6d1";
} & SessionSpaceCompressedId; // Same brand as CompressedId, as local IDs are always locally normalized

/**
 * @returns true if the supplied ID is a final ID.
 */
export function isFinalId(id: CompressedId): id is FinalCompressedId {
	return id >= 0;
}

/**
 * @returns true if the supplied ID is a local ID.
 */
export function isLocalId(id: CompressedId): id is LocalCompressedId {
	return id < 0;
}

/**
 * Turns a negative integer into a local compressed ID. For testing only.
 */
export function makeLocalId(negativeInteger: number): LocalCompressedId {
	const id = negativeInteger as CompressedId;
	assert(isLocalId(id), "Not a negative integer.");
	return id;
}

/**
 * Remove `readonly` from all fields.
 */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 */
export function getOrCreate<K, V>(map: Map<K, V>, key: K, defaultValue: (key: K) => V): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}

export function incrementStableId(stableId: StableId, offset: number): StableId {
	return stableIdFromNumericUuid(offsetNumericUuid(numericUuidFromStableId(stableId), offset));
}

/**
 * An immutable view of an `IdCompressor`
 */
export type ReadonlyIdCompressor = Omit<
	IdCompressor,
	| "generateCompressedId"
	| "generateCompressedIdRange"
	| "takeNextCreationRange"
	| "finalizeCreationRange"
>;

/**
 * Asserts a value is not undefined, and returns the value.
 * Use when violations are logic errors in the program.
 *
 * @remarks
 * When practical, prefer the pattern `x ?? fail('message')` over `assertNotUndefined(x, 'message')`.
 * Using `?? fail` allows for message formatting without incurring the cost of formatting the message
 * in the non failing case.
 *
 * Example:
 * ```typescript
 * x ?? fail(`x should exist for ${y}`)
 * ```
 *
 * Additionally the `?? fail` avoids an extra call/stack frame in the non failing case.
 *
 * Another pattern to prefer over `assertNotUndefined(x, 'message')` is `assert(x !== undefined)`.
 * This pattern is preferred because it is more general (same approach works with typeof, instance of,
 * comparison to other values etc.).
 *
 * @param value - Value to assert against is non undefined.
 * @param message - Message to be printed if assertion fails.
 */
export function assertNotUndefined<T>(
	value: T | undefined,
	message = "value must not be undefined",
): T {
	assert(value !== undefined, message);
	return value;
}

/**
 * Fails an assertion. Throws an Error that the assertion failed.
 * Use when violations are logic errors in the program.
 * @param message - Message to be printed if assertion fails.
 */
export function fail(message: string): never {
	assert(false, message);
}

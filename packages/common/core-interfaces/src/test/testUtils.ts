/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalUtilityTypes } from "../exposedInternalUtilityTypes.js";

import type {
	JsonTypeToOpaqueJson,
	OpaqueJsonToJsonType,
} from "@fluidframework/core-interfaces/internal";
import type {
	JsonSerializable,
	OpaqueJsonDeserialized,
	OpaqueJsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

/**
 * Use to compile-time assert types of two variables are identical.
 *
 * @remarks Note that this has not been found to be reliable when one of the
 * types (especially first type) is `{}` (which is a special type and may be
 * produced during type manipulation intentionally or not).
 */
export function assertIdenticalTypes<const T, const U>(
	_actual: T & InternalUtilityTypes.IfSameType<T, U>,
	_expected: U & InternalUtilityTypes.IfSameType<T, U>,
): InternalUtilityTypes.IfSameType<T, U> {
	return undefined as InternalUtilityTypes.IfSameType<T, U>;
}

/**
 * Creates a non-viable (`undefined`) instance of type T to be used for type checking.
 */
export function createInstanceOf<T>(): T {
	return undefined as T;
}

/**
 * JSON.stringify replacer function that replaces `bigint` values with a string representation.
 */
export function replaceBigInt(_key: string, value: unknown): unknown {
	if (typeof value === "bigint") {
		return `<bigint>${value.toString()}</bigint>`;
	}
	return value;
}

/**
 * JSON.parse reviver function that instantiates `bigint` values from specfic string representation.
 */
export function reviveBigInt(_key: string, value: unknown): unknown {
	if (
		typeof value === "string" &&
		value.startsWith("<bigint>") &&
		value.endsWith("</bigint>")
	) {
		return BigInt(value.slice(8, -9));
	}
	return value;
}

/**
 * Helper to return an Opaque Json type version of Json type
 */
export function castToOpaqueJson<const T>(v: JsonSerializable<T>): JsonTypeToOpaqueJson<T> {
	return v as unknown as JsonTypeToOpaqueJson<T>;
}

/**
 * Helper to cast an Opaque Json type to its inner Json type, applying appropriate filtering.
 * @remarks
 * Only works with basic built-in stringify-parse logic (i.e. default
 * {@link JsonSerializableOptions} and {@link JsonDeserializedOptions}).
 */
export function exposeFromOpaqueJson<
	TOpaque extends OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>,
>(v: TOpaque): OpaqueJsonToJsonType<TOpaque> {
	return v as unknown as OpaqueJsonToJsonType<TOpaque>;
}

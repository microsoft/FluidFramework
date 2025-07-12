/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalUtilityTypes } from "../exposedInternalUtilityTypes.js";

import type {
	JsonDeserialized,
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
 * Tests if a type is `any` and returns one of two types based on the result.
 *
 * @remarks
 * Use caution with this type as `TIfAny` and `TIfNotAny` are always evaluated
 * (externally), before the `any` check is performed (internally). This means
 * that if `TIfAny` or `TIfNotAny` are complex types, they will be evaluated
 * regardless of whether `T` is `any` or not. That will likely lead to
 * infinite recursion for any recursive `TIfAny` or `TIfNotAny` expressions.
 *
 * In such cases, test for `any` directly.
 */
type IfAny<T, TIfAny, TIfNotAny = never> = /* test for `any` */ boolean extends (
	T extends never
		? true
		: false
)
	? TIfAny
	: TIfNotAny;

/**
 * Searched for `any` types in a structure.
 *
 * @remarks
 * Locations of `any` types are preserved in the structure and all other
 * keys are removed. When there are no `any` types, the result is `never`.
 *
 * Use with {@link assertNever} to check that the result is `never`.
 *
 * @example
 * ```ts
 * // Error: Type '{ a: { b: "'any' found here"; }; }' does not satisfy the constraint 'never'
 * assertNever<AnyLocations<{ a: { b: any; c: string; }; d: number; }>>();
 * ```
 */
export type AnyLocations<
	T,
	TAncestorTypes extends unknown[] = [],
> = /* test for `any` */ boolean extends (T extends never ? true : false)
	? /* `any` */ "T is 'any'"
	: /* not `any` => test for object */ T extends object
		? /* object => test for recursion */ InternalUtilityTypes.IfExactTypeInTuple<
				T,
				TAncestorTypes,
				true,
				"no match"
			> extends true
			? /* recursion => no `any` */ never
			: /* process each key */ {
						[K in keyof T as IfAny<
							T[K],
							// K if `T[K]` is `any`
							K,
							// K only if `T[K]` has `any` locations
							AnyLocations<T[K], [...TAncestorTypes, T]> extends never ? never : K
						>]: IfAny<T[K], "'any' found here", AnyLocations<T[K], [...TAncestorTypes, T]>>;
					} extends infer LevelResult
				? /* test if any keys with `any` or nested `any */ keyof LevelResult extends never
					? /* no keys => no `any` */ never
					: /* keys worth reporting => */ LevelResult
				: /* never reached infer else */ never
		: /* not object => no `any` */ never;

/**
 * No-runtime-effect helper to check that {@link AnyLocations} results in `never`.
 */
export function assertNever<_ extends never>(): void {}

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
	return v as JsonTypeToOpaqueJson<T>;
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

/**
 * Process structure extracting `T` from `OpaqueJsonDeserialized<T>`.
 *
 * @remarks
 * Only one level of {@link OpaqueJsonDeserialized} is processed, so nested
 * {@link OpaqueJsonDeserialized} instances are retained.
 *
 * Only works with basic built-in stringify-parse logic (i.e. default
 * {@link JsonDeserializedOptions}).
 */
type RevealOpaqueJsonDeserialized<T> = T extends OpaqueJsonDeserialized<infer U>
	? JsonDeserialized<U>
	: { [Key in keyof T]: RevealOpaqueJsonDeserialized<T[Key]> };

/**
 * No-runtime-effect helper to reveal the JSON type from a value's opaque JSON
 * types throughout a structure.
 *
 * @see {@link RevealOpaqueJsonDeserialized}.
 */
export function revealOpaqueJson<T>(value: T): RevealOpaqueJsonDeserialized<T> {
	return value as RevealOpaqueJsonDeserialized<T>;
}

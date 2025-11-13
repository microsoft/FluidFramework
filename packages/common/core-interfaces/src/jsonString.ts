/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- incorrect rule: misunderstands `declare`d types.
import type { BrandedType } from "./brandedType.js";
import type { InternalUtilityTypes } from "./exposedInternalUtilityTypes.js";
import type { JsonDeserialized } from "./jsonDeserialized.js";
import type { JsonSerializable, JsonSerializableOptions } from "./jsonSerializable.js";

/**
 * Brand for JSON that has been stringified.
 *
 * Usage: Intersect with another type to apply branding.
 *
 * @sealed
 */
declare class JsonStringBrand<T> extends BrandedType<JsonString<unknown>> {
	public toString(): string;
	protected readonly EncodedValue: T;
	private constructor();
}

/**
 * Distributes `JsonStringBrand` over union elements of T.
 *
 * @remarks
 * This is useful to allow `JsonString<A | B>` to be assigned to `JsonString<A> | JsonString<B>`.
 *
 * The downside is that enums are expanded to union of members and thus cannot be
 * reconstituted exactly (even if IntelliSense shows the original enum type). This
 * can be removed if exact enum preservation is found to be more important.
 */
type DistributeJsonStringBrand<T> = T extends unknown ? JsonStringBrand<T> : never;

/**
 * Distributes branding over union elements of T unless result could prevent T
 * from being reconstituted (as in the case of an enum type), in which case it
 * falls back to a single JsonStringBrand for the entire T.
 *
 * @remarks
 * Note that an enum unioned with anything else will be distributed. It seems
 * however that TypeScript can/will reconstitute the enum type in that case.
 */
type BrandForJsonString<T> = InternalUtilityTypes.IfSameType<
	DistributeJsonStringBrand<T> extends JsonStringBrand<infer U> ? U : never,
	T,
	DistributeJsonStringBrand<T>,
	JsonStringBrand<T>
>;

/**
 * Branded `string` for JSON that has been stringified.
 *
 * @remarks
 *
 * Use {@link JsonStringify} to encode JSON producing values of this type and
 * {@link JsonParse} to decode them.
 *
 * For custom encoding/decoding:
 *
 * - cast to with `as unknown as JsonString<T>` when value of type `T` has been stringified.
 *
 * - use a form of {@link JsonDeserialized} for safety when parsing.
 *
 * @sealed
 * @internal
 */
export type JsonString<T> = string & BrandForJsonString<T>;

/**
 * Compile options for {@link JsonStringify}.
 *
 * @remarks
 * This only impacts type checking -- it has no impact on runtime.
 *
 * The options are currently a subset of {@link JsonSerializableOptions}, specifically
 * only `IgnoreInaccessibleMembers` is supported.
 *
 * No instance of this should ever exist at runtime.
 *
 * @privateRemarks
 * Consider adding `AllowUnknown` option to allow precisely `unknown` types to
 * be passed through. With `unknown` expected successful serialization could not
 * be checked at compile time. At deserialization time, `unknown` does not
 * guarantee any type and thus allowing does not erode type safety.
 *
 * @internal
 */
export type JsonStringifyOptions = Pick<JsonSerializableOptions, "IgnoreInaccessibleMembers">;

/**
 * Performs basic JSON serialization using `JSON.stringify` and brands the result as {@link JsonString}`<T>`.
 *
 * @remarks
 * Parameter `value` must be JSON-serializable and thus type T is put through filter {@link JsonSerializable}.
 *
 * @internal
 */
export const JsonStringify = JSON.stringify as <
	T,
	Options extends JsonStringifyOptions = Record<never, never>,
>(
	value: JsonSerializable<
		T,
		// Make sure only options that are known are passed through.
		Pick<Options, Extract<keyof JsonStringifyOptions, keyof Options>>
	>,
) => JsonString<T>;

/**
 * Performs basic JSON parsing using `JSON.parse` given a {@link JsonString}`<T>` (`string`).
 *
 * @remarks
 * Return type is filtered through {@link JsonDeserialized}`<T>` for best accuracy.
 *
 * Note that `JsonParse` cannot verify at runtime that the input is valid JSON
 * or that it matches type T. It is the caller's responsibility to ensure that
 * the input is valid JSON and the output conforms to the expected type.
 *
 * @internal
 */
export const JsonParse = JSON.parse as <T extends JsonString<unknown>>(
	text: T,
) => T extends JsonString<infer U> ? JsonDeserialized<U> : unknown;

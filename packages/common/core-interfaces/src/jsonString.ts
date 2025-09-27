/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- incorrect rule: misunderstands `declare`d types.
import type { BrandedType } from "./brandedType.js";
import type { JsonDeserialized } from "./jsonDeserialized.js";
import type { JsonSerializable } from "./jsonSerializable.js";

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
export type JsonString<T> = string & JsonStringBrand<T>;

/**
 * Options for {@link JsonStringify}.
 *
 * @internal
 */
export interface JsonStringifyOptions {
	/**
	 * When set, inaccessible (protected and private) members throughout type T are
	 * ignored as if not present. Otherwise, inaccessible members are considered
	 * an error (type checking will mention `SerializationErrorPerNonPublicProperties`).
	 *
	 * @remarks
	 * The default is that `IgnoreInaccessibleMembers` property is not specified,
	 * which means that inaccessible members are considered an error.
	 */
	IgnoreInaccessibleMembers?: "ignore-inaccessible-members";
}

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
 * @internal
 */
export const JsonParse: <T>(text: JsonString<T>) => JsonDeserialized<T> = JSON.parse;

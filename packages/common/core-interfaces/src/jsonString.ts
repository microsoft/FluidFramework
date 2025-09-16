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
 * Usage:
 *
 * - Cast to with `as unknown as JsonStringBrand<T>` when value of type `T` has been stringified.
 *
 * - Cast from with `as unknown as string` when "instance" will be parsed to `T`.
 *
 * @sealed
 * @internal
 */
declare class JsonStringBrand<T> extends BrandedType<T> {
	public toString(): string;
	private readonly EncodedValue: T;
	private constructor();
}

/**
 * Branded `string` for JSON that has been stringified.
 *
 * Usage:
 *
 * - Use {@link JsonStringify} to encode JSON producing values of this type and
 * {@link JsonParse} to decode them.
 *
 * - Cast to with `as unknown as JsonString<T>` when value of type `T` has been stringified.
 *
 * - Cast from with `as unknown as string` when "instance" will be parsed to `T`.
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
	 * ignored as if not present.
	 *
	 * The default value is not present.
	 */
	IgnoreInaccessibleMembers?: "ignore-inaccessible-members";
}

/**
 * @internal
 */
export const JsonStringify = JSON.stringify as <
	T,
	// eslint-disable-next-line @typescript-eslint/ban-types -- `Record<string, never>` is not sufficient replacement for empty object.
	Options extends JsonStringifyOptions = {},
>(
	value: JsonSerializable<T, Options>,
) => JsonString<T>;

/**
 * @internal
 */
export const JsonParse: <T>(text: JsonString<T>) => JsonDeserialized<T> = JSON.parse;

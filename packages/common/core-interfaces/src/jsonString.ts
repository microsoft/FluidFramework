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
 * - Cast to with `as unknown as JsonString<T>` when value of type `T` has been stringified.
 *
 * - Cast from with `as unknown as string` when "instance" will be parsed to `T`.
 *
 * @sealed
 * @internal
 */
export type JsonString<T> = string & JsonStringBrand<T>;

/**
 * @internal
 */
export const JsonStringify = JSON.stringify as <T>(
	value: JsonSerializable<T, { AllowExactly: [unknown] }>,
) => JsonString<T>;

/**
 * @internal
 */
export const JsonParse: <T>(
	text: JsonString<T>,
) => JsonDeserialized<T, { AllowExactly: [unknown] }> = JSON.parse;

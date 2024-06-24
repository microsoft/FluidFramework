/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type NumberOptions, type TUnsafe, Type } from "@sinclair/typebox";

/**
 * Create a TypeBox string schema for a branded string type.
 * This only validates that the value is a string,
 * and not that it came from the correct branded type (that information is lost when serialized).
 */
export function brandedStringType<T extends string>(): TUnsafe<T> {
	// This could use:
	// return TypeSystem.CreateType<T>(name, (options, value) => typeof value === "string")();
	// Since there isn't any useful custom validation to do and
	// TUnsafe is documented as unsupported in `typebox/compiler`,
	// opt for the compile time behavior like the above, but the runtime behavior of the built in string type.
	return Type.String() as unknown as TUnsafe<T>;
}

/**
 * Create a TypeBox number schema for a branded number type.
 * {@link brandedStringType} but for numbers.
 */
export function brandedNumberType<T extends number>(
	options?: NumberOptions | undefined,
): TUnsafe<T> {
	// See comments on `brandedStringType`.
	return Type.Number(options) as unknown as TUnsafe<T>;
}

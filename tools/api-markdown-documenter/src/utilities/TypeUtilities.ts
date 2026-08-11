/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type that removes `readonly` from fields.
 */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Represents a value that can be either a direct value of type `T` or a function that returns a value of type `T` given some parameters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ValueOrDerived<T, TArguments extends any[]> =
	| T
	| ((..._arguments: TArguments) => T);

/**
 * Returns the value of a `ValueOrDerived` object, either by directly returning the value or by calling the function with the provided arguments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getValueOrDerived<T, TArguments extends any[]>(
	valueOrDerived: ValueOrDerived<T, TArguments>,
	..._arguments: TArguments
): T {
	if (typeof valueOrDerived === "function") {
		return (valueOrDerived as (..._arguments: TArguments) => T)(..._arguments);
	}
	return valueOrDerived;
}

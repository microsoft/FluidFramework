/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Compile-time type utilities for manual type tests in this package.
 * These mirror the pattern used in the auto-generated type test files.
 */

/**
 * Asserts a type-level condition is true. Causes a compile error if the type parameter is not `true`.
 */
export type requireTrue<_X extends true> = true;
/**
 * Asserts a type-level condition is false. Causes a compile error if the type parameter is not `false`.
 */
export type requireFalse<_X extends false> = true;
/**
 * Evaluates whether `Source` is assignable to `Destination` at the type level.
 * Returns `true` if assignable, `false` otherwise.
 */
export type isAssignableTo<Source, Destination> = [Source] extends [Destination]
	? true
	: false;

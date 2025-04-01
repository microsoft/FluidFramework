/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Replaces the properties of T with the properties of U.
 *
 * For example, it's useful for overriding properties of a class (or exposing private properties) for testing
 *
 * @internal
 */
export type Patch<T, U> = Omit<T, keyof U> & U;

/**
 * Makes properties K in T mutable (not readonly).
 * If K is not provided, all properties are made mutable.
 */
export type Mutable<T, K extends keyof T = keyof T> = Patch<
	T,
	{
		-readonly [P in K]: T[P];
	}
>;

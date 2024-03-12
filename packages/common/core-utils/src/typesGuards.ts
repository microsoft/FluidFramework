/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Determines if an arbitrary  value is an object
 * @param value - The value to check to see if it is an object
 * @returns True if the passed value is an object
 *
 * @internal
 */
export const isObject = (value: unknown): value is object =>
	typeof value === "object" && value !== null;

/**
 * Determines if an arbitrary value is a promise
 * @param value - The value to check to see if it is a promise
 * @returns True if the passed value is a promise
 *
 * @internal
 */
export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
	isObject(value) && "then" in value && typeof value.then === "function";

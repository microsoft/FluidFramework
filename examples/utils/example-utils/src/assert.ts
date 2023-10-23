/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A browser friendly assert library.
 *
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * Only use this API when `false` indicates a logic error in the problem and thus a bug that should be fixed.
 * @param message - The message to include in the error when the condition does not hold.
 *
 * @remarks
 * Use this instead of the node's 'assert' package, which needs a polyfill for web and has a big impact on bundle sizes.
 * Can be used to narrow TypeScript types, allowing cases `assert(a instanceof A)` or `assert(typeof b === "number")` to replace `as` casts.
 *
 * See also {@link fail}.
 *
 * @public
 */
export function assert(condition: boolean, message = "error"): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

/**
 * Fails an assertion.
 * Throws an Error that the assertion failed.
 * Use when violations are logic errors in the program.
 *
 * @param message - Message to be printed if assertion fails.
 *
 * @remarks
 * Useful in the pattern `x ?? fail('message')`.
 * Using `?? fail` allows for message formatting without incurring the cost of formatting the message in the non failing case.
 *
 * Example:
 * ```typescript
 * x ?? fail(`x should exist for ${y}`)
 * ```
 *
 * See also {@link assert}.
 *
 * @public
 */
export function fail(message = "assertion failed"): never {
	throw new Error(message);
}

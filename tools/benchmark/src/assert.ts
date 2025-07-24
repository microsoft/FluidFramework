/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Asserts the specified condition.
 *
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * Only use this API when `false` indicates a logic error in the problem and thus a bug that should be fixed.
 * @param message - The message to include in the error when the condition does not hold.
 * A number should not be specified manually: use a string.
 * Before a release, policy-check should be run, which will convert any asserts still using strings to
 * use numbered error codes instead.
 * @remarks
 * Use this instead of the node 'assert' package, which requires polyfills to run in browser environments.
 */
export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		fail(message);
	}
}

/**
 * Throw an error that an assertion has failed.
 * @remarks
 * Use this instead of the node 'assert' package, which requires polyfills to run in browser environments.
 */
export function fail(message: string): never {
	throw new Error(`Failed assertion in @fluid-tools/benchmark: ${message}`);
}

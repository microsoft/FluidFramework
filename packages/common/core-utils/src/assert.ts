/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A browser friendly assert library.
 * Use this instead of the 'assert' package, which has a big impact on bundle sizes.
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * Only use this API when `false` indicates a logic error in the problem and thus a bug that should be fixed.
 * @param message - The message to include in the error when the condition does not hold.
 * A number should not be specified manually: use a string.
 * Before a release, policy-check should be run, which will convert any asserts still using strings to
 * use numbered error codes instead.
 * @alpha
 */
export function assert(condition: boolean, message: string | number): asserts condition {
	if (!condition) {
		const assertionError = new Error(
			typeof message === "number" ? `0x${message.toString(16).padStart(3, "0")}` : message,
		);
		// NOTE: DOESN'T ACTUALLY WORK - But shows how we would use errorOrigin besides "ffDependency"
		// We need to pull LoggingError into core-utils and use it here and add this prop that way.
		Object.assign(assertionError, { errorOrigin: "ffAssert" });
	}
}

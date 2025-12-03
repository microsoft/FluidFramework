/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { shortCodeMap } from "./assertionShortCodesMap.js";

/**
 * Validates that an error thrown by our `assert()` function has the expected message, or a
 * short code that corresponds to that message.
 *
 * @remarks
 * The main use case for this is so tests that expect specific assert() calls to fail can
 * always do comparisons based on the original string message, and work whether they run
 * before the policy-check tool replaces those strings with short codes, or after. Note that
 * it either returns true or throws an error (the behavior expected by NodeJS' `assert.throws()`).
 *
 * @param expectedErrorMessage - The message that the error object should match (either explicitly,
 * or because it contains a short code which maps to that message).
 * @returns an error validation function suitable for use with NodeJS's `assert.throws()`.
 * @internal
 */
export function validateAssertionError(
	expectedErrorMsg: string | RegExp,
): (error: Error) => true {
	return (error: Error) => {
		// Asserts with custom debugMessageBuilder put extra content on the second line of the message, even when tagged.
		// Thus extract the first line, which will be the assert tag if there is one, and replace it with the message from the shortCodeMap.
		const split = error.message.split("\n");
		const possibleShortCode = split[0].trim();
		if (possibleShortCode in shortCodeMap) {
			split[0] = shortCodeMap[possibleShortCode];
		}
		const mappedMsg = split.join("\n");

		if (testErrorMessage(mappedMsg, expectedErrorMsg)) {
			// This throws an Error instead of an AssertionError because AssertionError would require a dependency on the
			// node assert library, which we don't want to do for this library because it's used in the browser.
			const message = `Unexpected assertion thrown\nActual: ${error.message === mappedMsg ? error.message : `${error.message} ('${mappedMsg}')}`}\nExpected: ${expectedErrorMsg}`;
			throw new Error(message);
		}
		return true;
	};
}

/**
 * {@link validateError} for `UsageError`.
 * @internal
 */
export function validateUsageError(expectedErrorMsg: string | RegExp): (error: Error) => true {
	return validateError(expectedErrorMsg, UsageError);
}

/**
 * {@link validateError} for `TypeError`.
 * @internal
 */
export function validateTypeError(expectedErrorMsg: string | RegExp): (error: Error) => true {
	return validateError(expectedErrorMsg, TypeError);
}

/**
 * Validates that a specific kind of error was thrown with the expected message.
 * @remarks
 * Intended for use with NodeJS's `assert.throws`.
 * @see {@link validateAssertionError}, {@link validateUsageError}, {@link validateTypeError} for more specialized versions.
 * @returns an error validation function suitable for use with NodeJS's `assert.throws()`.
 * @internal
 */
export function validateError(
	expectedErrorMsg: string | RegExp,
	errorType: new (...args: any[]) => Error = Error,
): (error: Error) => true {
	return (error: Error) => {
		assert(
			error instanceof errorType,
			`Expected an error of type "${errorType.name}", but got "${error}"`,
		);
		if (testErrorMessage(error.message, expectedErrorMsg)) {
			throw new Error(
				`Unexpected ${errorType.name} thrown\nActual: ${error.message}\nExpected: ${expectedErrorMsg}`,
			);
		}
		return true;
	};
}

function testErrorMessage(actualMessage: string, expectedErrorMsg: string | RegExp): boolean {
	return typeof expectedErrorMsg === "string"
		? actualMessage !== expectedErrorMsg
		: !expectedErrorMsg.test(actualMessage);
}

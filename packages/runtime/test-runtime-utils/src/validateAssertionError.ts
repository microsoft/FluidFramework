/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { shortCodeMap } from "./assertionShortCodesMap.js";

/**
 * Validates that an error thrown by our assert() function has the expected message, or a
 * short code that corresponds to that message.
 *
 * @remarks
 * The main use case for this is so tests that expect specific assert() calls to fail can
 * always do comparisons based on the original string message, and work whether they run
 * before the policy-check tool replaces those strings with short codes, or after. Note that
 * it either returns true or throws an error (the behavior expected by NodeJS' `assert.throws()`).
 *
 * @param error - The error object thrown by our `assert()` function. Its `message` property could
 * be a short code, or the original string message coded into the `assert()`.
 * @param expectedErrorMessage - The message that the error object should match (either explicitly,
 * or because it contains a short code which maps to that message).
 * @returns `true` if the message in the error object that was passed in matches the expected
 * message. Otherwise it throws an error.
 * @internal
 */
export function validateAssertionError(
	error: Error,
	expectedErrorMsg: string | RegExp,
): boolean {
	// Asserts with custom debugMessageBuilder put extra content on the second line of the message, even when tagged.
	// Thus extract the first line, which will be the assert tag if there is one, and replace it with the message from the shortCodeMap.
	const split = error.message.split("\n");
	const possibleShortCode = split[0].trim();
	if (possibleShortCode in shortCodeMap) {
		split[0] = shortCodeMap[possibleShortCode];
	}
	const mappedMsg = split.join("\n");

	if (
		typeof expectedErrorMsg === "string"
			? mappedMsg !== expectedErrorMsg
			: !expectedErrorMsg.test(mappedMsg)
	) {
		// This throws an Error instead of an AssertionError because AssertionError would require a dependency on the
		// node assert library, which we don't want to do for this library because it's used in the browser.
		const message =
			possibleShortCode in shortCodeMap
				? `Unexpected assertion thrown\nActual: ${error.message}\nExpected: ${expectedErrorMsg}`
				: `Unexpected assertion thrown\nActual: ${error.message} ('${mappedMsg}')\nExpected: ${expectedErrorMsg}`;
		throw new Error(message);
	}
	return true;
}

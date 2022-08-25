/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AssertionError } from "assert";
import { shortCodeMap } from "./assertionShortCodesMap";

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
 *                be a short code, or the original string message coded into the `asert()`.
 * @param expectedErrorMessage - The message that the error object should match (either explicitly,
 *                               or because it contains a short code which maps to that message).
 * @returns - `true` if the message in the error object that was passed in matches the expected
 *            message. Otherwise it throws an error.
 */
export function validateAssertionError(error: Error, expectedErrorMsg: string): boolean {
    const mappedMsg = shortCodeMap[error.message] as string ?? error.message;
    if (mappedMsg !== expectedErrorMsg) {
        throw new AssertionError({ message: `Unexpected assertion thrown: ${error.message} ('${mappedMsg}')` });
    }
    return true;
}

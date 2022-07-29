/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A browser friendly version of the node assert library. Use this instead of the 'assert' package, which has a big
 * impact on bundle sizes.
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * @param message - The message to include in the error when the condition does not hold.
 * A number should not be specificed manually: use a string.
 * Before a release, policy-check should be run, which will convert any asserts still using strings to
 * use numbered error codes instead.
 */
export function assert(condition: boolean, message: string | number): asserts condition {
    if (!condition) {
        throw new Error(
            typeof message === "number" ? `0x${message.toString(16).padStart(3, "0")}` : message,
        );
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";

/**
 * Simple retry function with linear backoff.
 * It does not track/report errors and when attempts are exhausted
 * it will return a preconfigured value.
 *
 * @param callback - the function to execute
 * @param maxTries - maximum number of attempts
 * @param currentTry - current attempt number
 * @param backoffMs - backoff in milliseconds
 * @returns the result of the callback's promise or the default value
 */
export async function retry<T>(
    callback: () => Promise<T>,
    defaultValue: T,
    maxTries = 20,
    currentTry = 0,
    backoffMs = 50,
): Promise<T> {
    if (currentTry >= maxTries) {
        return Promise.resolve(defaultValue);
    }

    await delay(currentTry * backoffMs);
    return callback()
        .catch(async (e) => retry(callback, defaultValue, maxTries, currentTry + 1, backoffMs));
}

/**
 * Simple retry mechanism with liniar backoff to call
 * a function which may eventually return an expected value.
 *
 * @param callback - the function to execute
 * @param expectedValue - the expected value
 * @param defaultValue - the default value
 * @param maxTries - maximum number of attempts
 * @param backoffMs - backoff in milliseconds
 * @returns the expected value when sucessfull or the default value otherwise
 */
export const retryWithEventualValue = async <T>(
    callback: () => Promise<T>,
    expectedValue: T,
    defaultValue: T,
    maxTries = 20,
    backoffMs = 50,
): Promise<T> => retry(async () => {
    const value = await callback();
    if (value !== expectedValue) {
        throw Error("Not ready");
    }

    return expectedValue;
}, defaultValue, maxTries, 0, backoffMs);

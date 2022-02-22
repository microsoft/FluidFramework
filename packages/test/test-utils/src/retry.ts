/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";

const retry = async <T>(
    callback: () => Promise<T>,
    defaultValue: T,
    maxTries: number,
    backOffMs: number,
): Promise<T> => {
    for (let currentTry = 1; currentTry <= maxTries; currentTry++) {
        try {
            const result = await callback();
            return result;
        } catch (error) {
            await delay(currentTry * backOffMs);
        }
    }

    return Promise.resolve(defaultValue);
}

/**
 * Simple retry mechanism with linear back off to call
 * a function which may eventually return an accepted value.
 *
 * @param callback - the function to execute
 * @param check - the function to check if the value is acceptable
 * @param defaultValue - the default value
 * @param maxTries - maximum number of attempts
 * @param backOffMs - back off between attempts in milliseconds
 * @returns the actual value from the callback when successful or the default value otherwise
 */
export const retryWithEventualValue = async <T>(
    callback: () => Promise<T>,
    check: (value: T) => boolean,
    defaultValue: T,
    maxTries = 20,
    backOffMs = 50,
): Promise<T> => retry(async () => {
    const value = await callback();
    if (check(value)) {
        return value;
    }

    throw Error("Not ready");
}, defaultValue, maxTries, backOffMs);

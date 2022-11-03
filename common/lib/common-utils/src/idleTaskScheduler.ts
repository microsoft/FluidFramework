/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * API used to schedule non-essential tasks
 * Time measurements are in milliseconds as a floating point with a decimal
 * Takes in and runs a callback during idle time. Fallback to setTimeout if window doesn't
 * support requestIdleCallback.
 * @returns A promise pertaining to the callback that was passed in.
 */
export async function scheduleIdleTask<T>(callback: () => T, timeout: number): Promise<T> {

    return new Promise<T>((resolve, reject) => {
        const doLowPriorityTask = (): void => {
            try {
                resolve(callback());
            } catch (err: any) {
                reject(err);
            }
        };
        // Check for the availability
        if (typeof globalThis.requestIdleCallback === "function") {
            requestIdleCallback(doLowPriorityTask, { timeout });
        } else {
            setTimeout(doLowPriorityTask, timeout);
        }
    });
}

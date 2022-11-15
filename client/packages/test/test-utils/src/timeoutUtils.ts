/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "@fluidframework/container-loader";

export const defaultTimeoutDurationMs = 250;

export interface TimeoutWithError {
    durationMs?: number;
    reject?: true;
    errorMsg?: string;
}
export interface TimeoutWithValue<T = void> {
    durationMs?: number;
    reject: false;
    value: T;
}

export async function timeoutAwait<T = void>(
    promise: PromiseLike<T>,
    timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
) {
    return Promise.race([promise, timeoutPromise<T>(() => { }, timeoutOptions)]);
}

export async function ensureContainerConnected(container: Container): Promise<void> {
    if (!container.connected) {
        return timeoutPromise((resolve) => container.once("connected", () => resolve()));
    }
}

export async function timeoutPromise<T = void>(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
    timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T> {
    const timeout =
        timeoutOptions.durationMs !== undefined
        && Number.isFinite(timeoutOptions.durationMs)
        && timeoutOptions.durationMs > 0
            ? timeoutOptions.durationMs : defaultTimeoutDurationMs;
    // create the timeout error outside the async task, so its callstack includes
    // the original call site, this makes it easier to debug
    const err = timeoutOptions.reject === false
        ? undefined
        : new Error(`${timeoutOptions.errorMsg ?? "Timed out"}(${timeout}ms)`);
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => timeoutOptions.reject === false ? resolve(timeoutOptions.value) : reject(err),
            timeout);

        executor(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (reason) => {
                clearTimeout(timer);
                reject(reason);
            });
    });
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

export async function timeoutPromise<T = void>(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
    timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T> {
    const timeout =
        timeoutOptions.durationMs !== undefined
        && Number.isFinite(timeoutOptions.durationMs)
        && timeoutOptions.durationMs > 0
            ?  timeoutOptions.durationMs : defaultTimeoutDurationMs;
    // create the timeout error outside the async task, so it's callstack includes
    // the original call site, this makes it easier to debug
    const err = timeoutOptions.reject === false
        ? undefined
        : new Error(timeoutOptions.errorMsg ?? `Timed out after ${timeout} ms`);
    return new Promise<T>((res,rej)=>{
        const timer = setTimeout(
            ()=>timeoutOptions.reject === false ? res(timeoutOptions.value) : rej(err),
            timeout);

        executor(
            (value) => {
                clearTimeout(timer);
                res(value);
            },
            (reason) => {
                clearTimeout(timer);
                rej(reason);
            });
    });
}

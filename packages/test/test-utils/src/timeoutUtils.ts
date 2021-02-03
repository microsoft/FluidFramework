/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const defaultTimeoutDurationMs = 250;

 export interface TimeoutWithError{
    durationMs?: number;
    reject?: true;
    errorMsg?: string;
 }
 export interface TimeoutWithValue<T = void>{
    durationMs?: number;
    reject: false;
    value?: T;
 }

 export async function timeoutPromise<T = void>(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
    timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T | void> {
    // create the timeout error outside the async task, so it's callstack includes
    // the original call site, this makes it easier to debug
    const err = timeoutOptions.reject === false
        ? undefined
        : new Error(timeoutOptions.errorMsg ?? "Timeout");
    return new Promise<T | void>((res,rej)=>{
        const timeout = setTimeout(
            ()=>timeoutOptions.reject === false ? res(timeoutOptions.value) : rej(err),
            timeoutOptions.durationMs ?? defaultTimeoutDurationMs);

        executor(
            (value) => {
                clearTimeout(timeout);
                res(value);
            },
            (reason) => {
                clearTimeout(timeout);
                rej(reason);
            });
    });
}

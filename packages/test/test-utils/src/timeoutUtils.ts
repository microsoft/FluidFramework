/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "@fluidframework/container-loader";
import { assert } from "@fluidframework/common-utils";

export const defaultTimeoutDurationMs = 250;

// Patch mocha so we can timeout promises based on how much time is left in the test.
let currentTestEndTimeId = 0;
let currentTestEndTime = 0; // 0 means it is not set, -1 means timeout is disabled, otherwise, it is the test end time
const timeBuffer = 30; // leave 30ms leeway for finish processing

function getCurrentTestTimeout() {
    if (currentTestEndTime === -1) {
        return -1;
    }
    if (currentTestEndTime === 0) {
        return defaultTimeoutDurationMs;
    }
    // Even if we are passed our timeout, return 1ms so that we will still wait
    return Math.max(currentTestEndTime - Date.now(), 1);
}

function setTestEndTime(this: Mocha.Context) {
    const timeout = this.timeout();
    const now = Date.now();
    // Either the test timed out (so the test end time is less then now, or the promise resolved)
    assert(currentTestEndTime < now && currentTestEndTime !== -1, "Unexpected nested tests detected");
    const hasTimeout = Number.isFinite(timeout) && timeout > 0;
    currentTestEndTime = hasTimeout ? now + timeout - timeBuffer : -1;
    return ++currentTestEndTimeId;
}

function clearTestEndTime(this: Mocha.Context, value: number) {
    if (value === currentTestEndTimeId) {
        currentTestEndTime = 0;
    }
}

// only register if we are running with mocha-test-setup loaded
if (globalThis.registerMochaTestWrapperFuncs !== undefined) {
    globalThis.registerMochaTestWrapperFuncs(setTestEndTime, clearTestEndTime);
}

export interface TimeoutWithError {
    // Timeout duration in milliseconds.
    // If it is undefined, then the default is 250.
    // If it is <= 0 or infinity, then there is no timeout
    durationMs?: number;
    reject?: true;
    errorMsg?: string;
}
export interface TimeoutWithValue<T = void> {
    // Timeout duration in milliseconds.
    // If it is undefined, then the default is 250.
    // If it is <= 0 or infinity, then there is no timeout
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
    const timeout = timeoutOptions.durationMs ?? getCurrentTestTimeout();
    if (timeout <= 0 || !Number.isFinite(timeout)) {
        return new Promise(executor);
    }
    // create the timeout error outside the async task, so its callstack includes
    // the original call site, this makes it easier to debug
    const err = timeoutOptions.reject === false
        ? undefined
        : new Error(`${timeoutOptions.errorMsg ?? "Timed out"} (${timeout}ms)`);
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

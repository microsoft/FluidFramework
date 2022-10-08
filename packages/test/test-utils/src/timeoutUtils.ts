/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "@fluidframework/container-loader";
import { assert } from "@fluidframework/common-utils";

// @deprecated this value is no longer used
export const defaultTimeoutDurationMs = 250;

// Patch mocha so we can timeout promises based on how much time is left in the test.
let timeoutPromiseInstance: Promise<void> | undefined;
let testTimeout: number;
const timeBuffer = 15; // leave 15 ms leeway for finish processing

function trackTestEndTime(context: Mocha.Context) {
    assert(timeoutPromiseInstance === undefined, "Unexpected nested tests detected");
    let timeoutRejection: ((reason?: any) => void) | undefined;
    let timer: NodeJS.Timeout;
    timeoutPromiseInstance = new Promise<void>((resolve, reject) => timeoutRejection = reject);

    // Ignore rejection for timeout promise if no one is waiting for it.
    timeoutPromiseInstance.catch(() => {});

    const runnable = context.runnable();

    // function to reset the timer
    const resetTimer = () => {
        // clear current timer if there is one
        clearTimeout(timer);

        // Check the test timeout setting
        const timeout = context.timeout();
        if (!(Number.isFinite(timeout) && timeout > 0)) { return; }

        // subtract a buffer
        testTimeout = Math.max(timeout - timeBuffer, 1);

        // Set up timer to reject near the test timeout.
        timer = setTimeout(() => {
            if (timeoutRejection) {
                timeoutRejection(timeoutPromiseInstance);
                timeoutRejection = undefined;
            }
        }, testTimeout);
    };

    // patching resetTimeout and clearTimeout on the runnable object
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldResetTimeoutFunc = runnable.resetTimeout;
    runnable.resetTimeout = function(this: Mocha.Runnable) {
        oldResetTimeoutFunc.call(this);
        resetTimer();
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldClearTimeoutFunc = runnable.clearTimeout;
    runnable.clearTimeout = function(this: Mocha.Runnable) {
        clearTimeout(timer);
        oldClearTimeoutFunc.call(this);
    };

    if (runnable.timer !== undefined) {
        // set up the timer is already started
        resetTimer();
    }

    // clean up after the test is done
    return (c: Mocha.Context) => {
        timeoutPromiseInstance = undefined;
        clearTimeout(timer);
    };
}

// only register if we are running with mocha-test-setup loaded
if (globalThis.registerMochaTestWrapperFunc !== undefined) {
    globalThis.registerMochaTestWrapperFunc(trackTestEndTime);
}

export interface TimeoutWithError {
    // Timeout duration in milliseconds, if it is > 0 and not Infinity
    // If it is undefined, then it will use test timeout if we are in side the test function
    // Otherwise, there is no timeout
    durationMs?: number;
    reject?: true;
    errorMsg?: string;
}
export interface TimeoutWithValue<T = void> {
    // Timeout duration in milliseconds, if it is > 0 and not Infinity
    // If it is undefined, then it will use test timeout if we are in side the test function
    // Otherwise, there is no timeout
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

// Create a promise based on the timeout options
async function getTimeoutPromise<T = void>(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
    timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
) {
    const timeout = timeoutOptions.durationMs ?? 0;
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

// Create a promise based on test timeout and the timeout options
export async function timeoutPromise<T = void>(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
    timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T> {
    // create the timeout error outside the async task, so its callstack includes
    // the original call site, this makes it easier to debug
    const err = timeoutOptions.reject === false
        ? undefined
        : new Error(`${timeoutOptions.errorMsg ?? "Test timed out"} (${testTimeout}ms)`);
    const executorPromise = getTimeoutPromise(executor, timeoutOptions);
    if (timeoutPromiseInstance === undefined) { return executorPromise; }
    return Promise.race([executorPromise, timeoutPromiseInstance]).catch((e) => {
        if (e === timeoutPromiseInstance) {
            if (timeoutOptions.reject !== false) {
                // If the rejection is because of the timeout then
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                throw err!;
            }
            return timeoutOptions.value;
        }
        throw e;
    }) as Promise<T>;
}

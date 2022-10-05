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

function setTestEndTime(timeout: number) {
    const now = Date.now();
    // Either the test timed out (so the test end time is less then now, or the promise resolved)
    assert(currentTestEndTime < now && currentTestEndTime !== -1, "Unexpected nested tests detected");
    const hasTimeout = Number.isFinite(timeout) && timeout > 0;
    currentTestEndTime = hasTimeout ? now + timeout - timeBuffer : -1;
    return ++currentTestEndTimeId;
}

function clearTestEndTime(id) {
    if (id === currentTestEndTimeId) {
        currentTestEndTime = 0;
    }
}

function getWrappedFunction(fn: Mocha.Func | Mocha.AsyncFunc) {
    if (fn.length > 0) {
        return function(this: Mocha.Context, done) {
            const id = setTestEndTime(this.timeout());
            try {
                (fn as Mocha.Func).call(this, done);
            } finally {
                clearTestEndTime(id);
            }
        };
    }
    return function(this: Mocha.Context) {
        const id = setTestEndTime(this.timeout());

        let ret: PromiseLike<any> | void;
        try {
            ret = (fn as Mocha.AsyncFunc).call(this);
        } finally {
            clearTestEndTime(id);
        }

        if (typeof ret?.then === "function") {
            // Start the timer again to wait for async
            const asyncId = setTestEndTime(this.timeout());
            // Clear the timer if the promise resolves.
            // use the id to avoid clearing the end time if it resolves after timing out
            const clearFunc = () => { clearTestEndTime(asyncId); };
            ret?.then(clearFunc, clearFunc);
        }
        return ret;
    };
}

let newTestFunction: Mocha.TestFunction | undefined;
function setupMocha() {
    const currentTestFunction = globalThis.it;
    // the function `it` is reassign per test files. Trap it.
    Object.defineProperty(globalThis, "it", {
        get: () => { return newTestFunction; },
        set: (oldTestFunction: Mocha.TestFunction | undefined) => {
            if (oldTestFunction === undefined) { newTestFunction = undefined; return; }
            newTestFunction = ((title: string, fn?: Mocha.Func | Mocha.AsyncFunc) => {
                return oldTestFunction(title, fn && typeof fn.call === "function" ?
                    getWrappedFunction(fn)
                    : fn);
            }) as Mocha.TestFunction;
            newTestFunction.skip = oldTestFunction.skip;
            newTestFunction.only = oldTestFunction.only;
        },
    });
    globalThis.it = currentTestFunction;
}

setupMocha();

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

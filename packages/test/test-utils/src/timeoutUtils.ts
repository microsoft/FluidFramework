/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

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

/**
 * Utility function to wait for the specified Container to be in Connected state.
 * If the Container is already connected, the Promise returns immediately; otherwise it resolves when the Container emits
 * its 'connected' event.
 * If failOnContainerClose === true, the returned Promise will be rejected if the container emits a 'closed' event
 * before a 'connected' event.
 * @param container - The container to wait for.
 * @param timeoutOptions - Options related to the behavior of the timeout.
 * Defaults to timing out after 1000 ms.
 * This is an arbitrary value and we should adjust it if we see legitimate reasons for it.
 * @param failOnContainerClose - If true, the returned Promise will be rejected if the container emits a 'closed' event
 * before a 'connected' event.
 * Defaults to true.
 * @returns A Promise that resolves when the specified container emits a 'connected' event (or immediately if the
 * Container is already connected).
 * If failOnContainerClose === true and the container emits a 'closed' event before a 'connected' event, the Promise
 * is rejected with the error from the 'closed' event, if any.
 */
export async function waitForContainerConnection(
    container: IContainer,
    timeoutOptions: TimeoutWithError = { durationMs: 1000 },
    failOnContainerClose: boolean = true): Promise<void> {
    if (container.connectionState !== ConnectionState.Connected) {
        return timeoutPromise((resolve, reject) => {
            container.once("connected", () => resolve());
            if (failOnContainerClose) {
                container.once("closed", (error) =>  reject(error));
            }
        }, timeoutOptions);
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

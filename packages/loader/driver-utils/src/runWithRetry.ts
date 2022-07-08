/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { delay, performance, unreachableCase } from "@fluidframework/common-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { canRetryOnError, getRetryDelayFromError, NonRetryableError } from "./network";
import { pkgVersion } from "./packageVersion";
import { AbortSignal } from "./abortControllerShim";

/**
 * @deprecated - use IProgress2
 * Interface describing an object passed to various network APIs.
 * It allows caller to control cancellation, as well as learn about any delays.
 */
export interface IProgress {
    /**
     * Abort signal used to cancel operation
     * Note that most of the layers do not use this signal yet. We need to change that over time.
     * Please consult with API documentation / implementation.
     * Note that  number of layers may not check this signal while holding this request in a queue,
     * so it may take a while it takes effect. This can be improved in the future.
     * Layers in question are:
     *    - driver (RateLimiter)
     *    - runWithRetry
     */
    cancel?: AbortSignal;

    /**
     * Called whenever api returns cancellable error and the call is going to be retried.
     * Any exception thrown from this call back result in cancellation of operation
     * and propagation of thrown exception.
     * @param delayInMs - delay before next retry. This value will depend on internal back-off logic,
     * as well as information provided by service (like 429 error asking to wait for some time before retry)
     * @param error - error object returned from the call.
     */
    onRetry?(delayInMs: number, error: any): void;
}

export interface IProgress2 {
    /**
     * Abort signal used to cancel operation
     * Note that most of the layers do not use this signal yet. We need to change that over time.
     * Please consult with API documentation / implementation.
     * Note that  number of layers may not check this signal while holding this request in a queue,
     * so it may take a while it takes effect. This can be improved in the future.
     * Layers in question are:
     *    - driver (RateLimiter)
     *    - runWithRetry
     */
    cancel?: AbortSignal;

    /**
     * Called whenever api returns cancellable error and the call is going to be retried.
     * @param delayInMs - delay before next retry. This value will depend on internal back-off logic,
     * as well as information provided by service (like 429 error asking to wait for some time before retry)
     * @param error - error object returned from the call.
     * @returns - A reason for aborting the operation, or undefined to continue retrying
     */
    onRetry?(delayInMs: number, error: unknown): string | undefined;
}

export type RunResult<T> = {
    status: "succeeded";
    result: T;
} | {
    status: "failed";
    error: unknown;
} | {
    status: "aborted";
    reason: string;
};

export async function runWithRetry2<T>(
    api: (cancel?: AbortSignal) => Promise<T>,
    fetchCallName: string,
    logger: ITelemetryLogger,
    progress: IProgress2,
): Promise<RunResult<T>> {
    let successResult: RunResult<T> | undefined;
    let retryAfterMs = 1000; // has to be positive!
    let numRetries = 0;
    const startTime = performance.now();
    let lastError: any;
    do {
        try {
            const result = await api(progress.cancel);
            successResult = {
                status: "succeeded",
                result,
            };
        } catch (err) {
            // If it is not retriable, then just throw the error.
            if (!canRetryOnError(err)) {
                logger.sendTelemetryEvent({
                    eventName: `${fetchCallName}_cancel`,
                    retry: numRetries,
                    duration: performance.now() - startTime,
                    fetchCallName,
                }, err);
                return {
                    status: "failed",
                    error: err,
                };
            }

            if (progress.cancel?.aborted === true) {
                const reason = progress.cancel.reason;
                logger.sendTelemetryEvent({
                    eventName: `${fetchCallName}_runWithRetryAborted`,
                    retry: numRetries,
                    duration: performance.now() - startTime,
                    fetchCallName,
                    reason,
                }, err);

                return {
                    status: "aborted",
                    reason: reason?.toString() ?? "UNSPECIFIED",
                };
            }

            numRetries++;
            lastError = err;
            // If the error is throttling error, then wait for the specified time before retrying.
            // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
            retryAfterMs = getRetryDelayFromError(err) ?? Math.min(retryAfterMs * 2, 8000);
            if (progress.onRetry) {
                const abortReason = progress.onRetry(retryAfterMs, err);
                if (abortReason !== undefined) {
                    return {
                        status: "aborted",
                        reason: abortReason,
                    };
                }
            }
            await delay(retryAfterMs);
        }
    } while (successResult === undefined);
    if (numRetries > 0) {
        logger.sendTelemetryEvent({
            eventName: `${fetchCallName}_lastError`,
            retry: numRetries,
            duration: performance.now() - startTime,
            fetchCallName,
        },
        lastError);
    }
    return successResult;
}

/** @deprecated - use runWithRetry2 */
export async function runWithRetry<T>(
    api: (cancel?: AbortSignal) => Promise<T>,
    fetchCallName: string,
    logger: ITelemetryLogger,
    progress: IProgress,
): Promise<T> {
    const progress2: IProgress2 = {
        cancel: progress.cancel,
        onRetry(delayInMs: number, error: unknown): string | undefined {
            try {
                progress.onRetry?.(delayInMs, error);
                return undefined;
            } catch (e: any) {
                return e.message as string;
            }
        },
    };

    const runResult = await runWithRetry2(api, fetchCallName, logger, progress2);
    switch (runResult.status) {
        case "succeeded":
            return runResult.result;
        case "failed":
            throw runResult.error;
        case "aborted":
            throw new NonRetryableError(
                `runWithRetry for [${fetchCallName}] was aborted due to reason [${runResult.reason}]`,
                DriverErrorType.genericError,
                { driverVersion: pkgVersion, fetchCallName, reason: runResult.reason },
            );
        default:
            unreachableCase(runResult);
    }
}

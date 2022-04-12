/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { delay, performance } from "@fluidframework/common-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { canRetryOnError, getRetryDelayFromError } from "./network";
import { pkgVersion } from "./packageVersion";
import { NonRetryableError } from ".";

/**
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

export async function runWithRetry<T>(
    api: (cancel?: AbortSignal) => Promise<T>,
    fetchCallName: string,
    logger: ITelemetryLogger,
    progress: IProgress,
): Promise<T> {
    let result: T | undefined;
    let success = false;
    let retryAfterMs = 1000; // has to be positive!
    let numRetries = 0;
    const startTime = performance.now();
    let lastError: any;
    do {
        try {
            result = await api(progress.cancel);
            success = true;
        } catch (err) {
            // If it is not retriable, then just throw the error.
            if (!canRetryOnError(err)) {
                logger.sendTelemetryEvent({
                    eventName: `${fetchCallName}_cancel`,
                    retry: numRetries,
                    duration: performance.now() - startTime,
                    fetchCallName,
                }, err);
                throw err;
            }

            if (progress.cancel?.aborted === true) {
                logger.sendTelemetryEvent({
                    eventName: `${fetchCallName}_runWithRetryAborted`,
                    retry: numRetries,
                    duration: performance.now() - startTime,
                    fetchCallName,
                }, err);
                throw new NonRetryableError(
                    "runWithRetry was Aborted",
                    DriverErrorType.genericError,
                    { driverVersion: pkgVersion, fetchCallName },
                );
            }

            numRetries++;
            lastError = err;
            // If the error is throttling error, then wait for the specified time before retrying.
            // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
            retryAfterMs = getRetryDelayFromError(err) ?? Math.min(retryAfterMs * 2, 8000);
            if (progress.onRetry) {
                progress.onRetry(retryAfterMs, err);
            }
            await delay(retryAfterMs);
        }
    } while (!success);
    if (numRetries > 0) {
        logger.sendTelemetryEvent({
            eventName: `${fetchCallName}_lastError`,
            retry: numRetries,
            duration: performance.now() - startTime,
            fetchCallName,
        },
        lastError);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return result!;
}

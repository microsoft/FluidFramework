/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { delay, performance } from "@fluidframework/common-utils";
import { canRetryOnError, getRetryDelayFromError } from "./network";

export async function runWithRetry<T>(
    api: () => Promise<T>,
    fetchCallName: string,
    refreshDelayInfo: (id: string) => void,
    emitDelayInfo: (id: string, retryInMs: number, err: any) => void,
    logger: ITelemetryLogger,
    checkRetry?: () => void,
): Promise<T> {
    let result: T | undefined;
    let success = false;
    let retryAfterMs = 1000; // has to be positive!
    let numRetries = 0;
    const startTime = performance.now();
    let lastError: any;
    let id: string | undefined;
    do {
        try {
            result = await api();
            if (id !== undefined) {
                refreshDelayInfo(id);
            }
            success = true;
        } catch (err) {
            if (checkRetry !== undefined) {
                checkRetry();
            }
            // If it is not retriable, then just throw the error.
            if (!canRetryOnError(err)) {
                logger.sendErrorEvent({
                    eventName: fetchCallName,
                    retry: numRetries,
                    duration: performance.now() - startTime,
                }, err);
                throw err;
            }
            numRetries++;
            lastError = err;
            // If the error is throttling error, then wait for the specified time before retrying.
            // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
            retryAfterMs = getRetryDelayFromError(err) ?? Math.min(retryAfterMs * 2, 8000);
            if (id === undefined) {
                id = uuid();
            }
            emitDelayInfo(id, retryAfterMs, err);
            await delay(retryAfterMs);
        }
    } while (!success);
    if (numRetries > 0) {
        logger.sendTelemetryEvent({
            eventName: fetchCallName,
            retry: numRetries,
            duration: performance.now() - startTime,
        },
        lastError);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return result!;
}

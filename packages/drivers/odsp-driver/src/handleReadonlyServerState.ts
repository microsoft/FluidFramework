/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, delay } from "@fluidframework/common-utils";
import { getRetryDelayFromError } from "@fluidframework/driver-utils";
import { OdspErrorType } from "@fluidframework/odsp-driver-definitions";
import { FetchType } from "./epochTracker";

export async function handleReadOnlyServerState<T>(
    api: () => Promise<T>,
    logger: ITelemetryLogger,
    fetchType: FetchType,
) {
    let result: T | undefined;
    let success = false;
    let retryAfterMs = 1000; // has to be positive!
    let numRetries = 0;
    const maxRetries = 5;
    let lastError: any;
    do {
        try {
            result = await api();
            success = true;
        } catch (error) {
            lastError = error;
            // If the innerMostError is not "ServiceReadonly" error or we have retried the max times, then just
            // give up.
            if (error?.innerMostErrorCode !== OdspErrorType.serviceReadOnly || numRetries >= maxRetries) {
                break;
            }
            numRetries++;
            // If the error is about server becoming readonly for sometime, then wait for the specified time
            // before retrying. If the waitTime is not specified, then we start with retrying immediately
            // to max of 8s.
            retryAfterMs = getRetryDelayFromError(error) ?? Math.min(retryAfterMs, 8000);
            await delay(retryAfterMs);
            retryAfterMs *= 2;
        }
    } while (!success);
    if (numRetries > 0) {
        logger.sendTelemetryEvent({
            eventName: "RetriesForServiceReadOnlyState",
            fetchType,
            retry: numRetries,
        },
        lastError);
    }
    if (success) {
        assert(result !== undefined, "Result should be defined if success");
        return result;
    }
    throw lastError;
}

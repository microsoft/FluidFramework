/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, delay, performance } from "@fluidframework/common-utils";
import { canRetryOnError } from "@fluidframework/driver-utils";
import { OdspErrorType } from "@fluidframework/odsp-driver-definitions";

/**
 * This method retries only for retriable service read only errors.
 */
export async function runWithRetry<T>(
    api: () => Promise<T>,
    callName: string,
    logger: ITelemetryLogger,
    checkDisposed?: () => void,
): Promise<T> {
    let retryAfter = 1000;
    const start = performance.now();
    for (let retry = 1; ; retry++) {
        if (checkDisposed !== undefined) {
            checkDisposed();
        }
        try {
            return await api();
        } catch (error) {
            const canRetry = canRetryOnError(error);

            const serviceReadonlyError = error?.errorType === OdspErrorType.serviceReadOnly;
            // Retry for serviceReadOnly errors.
            if (!serviceReadonlyError) {
                throw error;
            }

            // SPO itself does number of retries internally before returning 409 to client.
            // That multiplied to 5 suggests need to reconsider current design, as client spends
            // too much time / bandwidth doing the same thing without any progress.
            if (retry === 5) {
                logger.sendErrorEvent({
                    eventName: "ServiceReadonlyErrorTooManyRetries",
                    callName,
                    retry,
                    duration: performance.now() - start, // record total wait time.
                });
                // Fail hard.
                error.canRetry = false;
                throw error;
            }

            assert(canRetry, "can retry");
            await delay(Math.floor(retryAfter));
            retryAfter += retryAfter / 4  * (1 + Math.random());
        }
    }
}

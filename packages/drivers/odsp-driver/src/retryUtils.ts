/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, delay, performance } from "@fluidframework/common-utils";
import { canRetryOnError } from "@fluidframework/driver-utils";
import { OdspErrorType } from "@fluidframework/odsp-driver-definitions";
import { Odsp409Error } from "./epochTracker";

/**
 * This method retries only for retriable coherency and service read only errors.
 */
export async function runWithRetry<T>(
    api: () => Promise<T>,
    callName: string,
    logger: ITelemetryLogger,
    checkDisposed?: () => void,
): Promise<T> {
    let retryAfter = 1000;
    const start = performance.now();
    let lastError: any;
    for (let attempts = 1; ; attempts++) {
        if (checkDisposed !== undefined) {
            checkDisposed();
        }
        try {
            const result = await api();
            if (attempts > 1) {
                logger.sendTelemetryEvent(
                    {
                        eventName: "MultipleRetries",
                        callName,
                        attempts,
                        duration: performance.now() - start,
                    },
                    lastError);
            }
            return result;
        } catch (error: any) {
            const canRetry = canRetryOnError(error);

            const coherencyError = error?.[Odsp409Error] === true;
            const serviceReadonlyError = error?.errorType === OdspErrorType.serviceReadOnly;
            // Retry for 409 coherency errors or serviceReadOnly errors.
            if (!(coherencyError || serviceReadonlyError)) {
                throw error;
            }

            // SPO itself does number of retries internally before returning 409 to client.
            // That multiplied to 5 suggests need to reconsider current design, as client spends
            // too much time / bandwidth doing the same thing without any progress.
            if (attempts === 5) {
                logger.sendErrorEvent(
                    {
                        eventName: coherencyError ?
                            "CoherencyErrorTooManyRetries" : "ServiceReadonlyErrorTooManyRetries",
                        callName,
                        attempts,
                        duration: performance.now() - start, // record total wait time.
                    },
                    error);
                // Fail hard.
                error.canRetry = false;
                throw error;
            }

            assert(canRetry, 0x24d /* "can retry" */);
            await delay(Math.floor(retryAfter));
            retryAfter += retryAfter / 4 * (1 + Math.random());
            lastError = error;
        }
    }
}

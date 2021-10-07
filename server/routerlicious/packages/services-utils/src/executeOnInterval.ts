/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";

export function executeOnInterval(
    api: () => Promise<any>,
    intervalInMs: number,
    callName: string,
    retryCount = 0,
    onErrorFn?: () => void,
    shouldRetryError?: (error) => boolean,
    shouldBackOffRetry?: (error, retryCount) => boolean): void {
    let error;
    let retries = retryCount;
    let interval = intervalInMs;
    api()
        .then((res) => {
            Lumberjack.info(`Success executing ${callName}`, undefined);
            // reset the retries count if api call succeeded
            retries = 0;
        })
        .catch((err) => {
            error = err;
            Lumberjack.error(`Error running ${callName}`, undefined, err);
            if (onErrorFn !== undefined) {
                onErrorFn();
            }
        })
        .finally(() => {
            if (error === undefined || shouldRetryError === undefined) {
                // if no error or no retry logic is defined, always make the next call (retries will be 0)
                setTimeout(() => executeOnInterval(api, intervalInMs, callName, retries), intervalInMs);
                return;
            }

            if (!shouldRetryError(error)) {
                return;
            }

            Lumberjack.info(`Will retry error ${error}, retryCount is ${retries}`);
            if (shouldBackOffRetry !== undefined && shouldBackOffRetry(error, retries)) {
                interval = interval * 2 ** retries;
                Lumberjack.info(`Will backoff next retry, interval is ${interval} milliseconds`);
            }
            retries += 1;
            setTimeout(() => executeOnInterval(api, intervalInMs, callName, retries), interval);
        });
}

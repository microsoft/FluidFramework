/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";
import { ILogger } from "./lambdas";

export async function runWithRetry<T>(
    api: () => Promise<T>,
    callName: string,
    maxRetries: number,
    retryAfterMs: number,
    logger?: ILogger,
    shouldIgnoreError?: (error) => boolean,
    shouldRetry?: (error) => boolean,
    calculateIntervalMs?: (error, numRetries, retryAfterMs) => number,
    onErrorFn?: (error) => void,
): Promise<T | undefined> {
    let result: T | undefined;
    let retryCount = 0;
    let success = false;
    let calcuteIntervalFn = calculateIntervalMs;
    do  {
        try {
            result = await api();
            success = true;
        } catch (error) {
            logger?.info(`Error running ${callName}: retryCount ${retryCount}, error ${error}`);
            if (onErrorFn !== undefined) {
                onErrorFn(error);
            }
            if (shouldIgnoreError !== undefined && shouldIgnoreError(error) === true) {
                logger?.info(`Should ignore error for ${callName}`);
                break;
            } else if (shouldRetry !== undefined && shouldRetry(error) === false)
            {
                logger?.info(`Should not retry ${callName}`);
                return Promise.reject(error);
            }
            // if maxRetries is -1, we retry indefinitely
            // unless shouldRetry returns false at some point.
            if (maxRetries !== -1 && retryCount >= maxRetries) {
                logger?.info(`Error after retrying ${retryCount} times, rejecting`);
                // Needs to be a full rejection here
                return Promise.reject(error);
            }

            if (calcuteIntervalFn === undefined) {
                calcuteIntervalFn = (err, numRetries, retryAfterInterval) => {
                    return retryAfterInterval * 2 ** numRetries;
                };
            }

            const intervalMs = calcuteIntervalFn(error, retryCount, retryAfterMs);
            await delay(intervalMs);
            retryCount++;
        }
    } while (!success);

    return result;
}

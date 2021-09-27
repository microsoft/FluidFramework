/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { ILogger } from "./lambdas";

export async function runWithRetry<T>(
    api: () => Promise<T>,
    callName: string,
    maxRetries: number,
    retryAfterMs: number,
    logger?: ILogger,
    shouldIgnoreError?: (error) => boolean,
    shouldRetry?: (error) => boolean,
): Promise<T | undefined> {
    let result: T | undefined;
    let retryCount = 0;
    let success = false;
    do  {
        try {
            result = await api();
            success = true;
            if (retryCount >= 1) {
                logger?.info(`Succeeded in executing ${callName} with ${retryCount} retries`);
                Lumberjack.info(`Succeeded in executing ${callName} with ${retryCount} retries`);
            }
        } catch (error) {
            logger?.error(`Error running ${callName}: retryCount ${retryCount}, error ${error}`);
            Lumberjack.error(`Error running ${callName}: retryCount ${retryCount}`, undefined, error);
            if (shouldIgnoreError !== undefined && shouldIgnoreError(error) === true) {
                logger?.info(`Should ignore error for ${callName}`);
                Lumberjack.info(`Should ignore error for ${callName}`);
                break;
            } else if (shouldRetry !== undefined && shouldRetry(error) === false)
            {
                logger?.error(`Should not retry ${callName} for the current error, rejecting ${error}`);
                Lumberjack.error(`Should not retry ${callName} for the current error, rejecting`, undefined, error);
                return Promise.reject(error);
            }
            if (retryCount >= maxRetries) {
                logger?.error(`Error after retrying ${retryCount} times, rejecting`);
                Lumberjack.error(`Error after retrying ${retryCount} times, rejecting`, undefined, error);
                // Needs to be a full rejection here
                return Promise.reject(error);
            }
            await delay(retryAfterMs * 2 ** retryCount);
            retryCount++;
        }
    } while (!success);

    return result;
}

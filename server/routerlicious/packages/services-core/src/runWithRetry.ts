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
        } catch (error) {
            logger?.info(`Error running ${callName}: retryCount ${retryCount}, error ${error}`);
            if (shouldIgnoreError !== undefined && shouldIgnoreError(error) === true) {
                logger?.info(`Should ignore error for ${callName}`);
                Lumberjack.info(`Should ignore error for ${callName}`);
                break;
            } else if (shouldRetry !== undefined && shouldRetry(error) === false)
            {
                logger?.info(`Should not retry ${callName}`);
                Lumberjack.info(`Should not retry ${callName}`);
                return Promise.reject(error);
            }
            if (retryCount >= maxRetries) {
                logger?.info(`Error after retrying ${retryCount} times, rejecting`);
                Lumberjack.info(`Error after retrying ${retryCount} times, rejecting`);
                // Needs to be a full rejection here
                return Promise.reject(error);
            }
            await delay(retryAfterMs * 2 ** retryCount);
            retryCount++;
        }
    } while (!success);

    return result;
}

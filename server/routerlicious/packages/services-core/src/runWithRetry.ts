/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { ILogger } from "./lambdas";
/**
 * @param  {()=>Promise<T>} api - function to run and retry in case of error
 * @param  {string} callName - name of the api function we are calling
 * @param  {number} maxRetries - maximum retries after which error is thrown. Retry infinitely if set to -1
 * @param  {number} retryAfterMs - interval factor to wait before retrying. Param to calculateIntervalMs
 * @param  {ILogger} logger? - e.g. winston logger to log on error
 * @param  {(error)=>boolean} shouldIgnoreError? - function that takes error and decides whether to ignore it
 * @param  {(error)=>boolean} shouldRetry? - function that takes error and decides whether to retry on it
 * @param  {(error, numRetries, retryAfterInterval)=>number} calculateIntervalMs
 * function which alculates interval to wait before retrying based on error, retryAfterMs and retries so far
 * @param  {(error)=>void} onErrorFn? - function allowing caller to define custom logic to run on error e.g. custom logs
 */
export async function runWithRetry<T>(
    api: () => Promise<T>,
    callName: string,
    maxRetries: number,
    retryAfterMs: number,
    logger?: ILogger,
    shouldIgnoreError?: (error) => boolean,
    shouldRetry?: (error) => boolean,
    calculateIntervalMs = (error, numRetries, retryAfterInterval) => retryAfterInterval * 2 ** numRetries,
    onErrorFn?: (error) => void,
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
            if (onErrorFn !== undefined) {
                onErrorFn(error);
            }
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
            // if maxRetries is -1, we retry indefinitely
            // unless shouldRetry returns false at some point.
            if (maxRetries !== -1 && retryCount >= maxRetries) {
                logger?.error(`Error after retrying ${retryCount} times, rejecting`);
                Lumberjack.error(`Error after retrying ${retryCount} times, rejecting`, undefined, error);
                // Needs to be a full rejection here
                return Promise.reject(error);
            }

            const intervalMs = calculateIntervalMs(error, retryCount, retryAfterMs);
            await delay(intervalMs);
            retryCount++;
        }
    } while (!success);

    return result;
}

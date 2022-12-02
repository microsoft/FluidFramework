/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";
import { Lumber, LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import { NetworkError } from "@fluidframework/server-services-client";

/**
 * Executes a given API while providing support to retry on failures, ignore failures, and taking action on error.
 * @param api - function to run and retry in case of error
 * @param callName - name of the api function we are calling
 * @param maxRetries - maximum retries after which error is thrown. Retry infinitely if set to -1
 * @param retryAfterMs - interval factor to wait before retrying. Param to calculateIntervalMs
 * @param telemetryProperties - telemetry properties to be used by Lumberjack
 * @param shouldIgnoreError - function that takes error and decides whether to ignore it
 * @param shouldRetry - function that takes error and decides whether to retry on it
 * @param calculateIntervalMs - function which calculates interval to wait before retrying based on error, retryAfterMs
 * and retries so far
 * @param onErrorFn - function allowing caller to define custom logic to run on error e.g. custom logs
 * @param telemetryEnabled - whether to log telemetry metric, default is false
 */
export async function runWithRetry<T>(
    api: () => Promise<T>,
    callName: string,
    maxRetries: number,
    retryAfterMs: number,
    telemetryProperties?: Map<string, any> | Record<string, any>,
    shouldIgnoreError?: (error) => boolean,
    shouldRetry?: (error) => boolean,
    calculateIntervalMs = (error, numRetries, retryAfterInterval) => retryAfterInterval * 2 ** numRetries,
    onErrorFn?: (error) => void,
    telemetryEnabled = false,
): Promise<T | undefined> {
    let result: T | undefined;
    let retryCount = 0;
    let success = false;
    let metric: Lumber<LumberEventName.RunWithRetry>;
    let metricError;
    if (telemetryEnabled) {
        metric = Lumberjack.newLumberMetric(
            LumberEventName.RunWithRetry,
            telemetryProperties);
    }
    try {
        do {
            try {
                result = await api();
                success = true;
                if (retryCount >= 1) {
                    Lumberjack.info(`Succeeded in executing ${callName} with ${retryCount} retries`, telemetryProperties);
                }
            } catch (error) {
                metricError = error;
                Lumberjack.error(`Error running ${callName}: retryCount ${retryCount}`, telemetryProperties, error);
                if (onErrorFn !== undefined) {
                    onErrorFn(error);
                }
                if (shouldIgnoreError !== undefined && shouldIgnoreError(error) === true) {
                    Lumberjack.info(`Should ignore error for ${callName}`, telemetryProperties);
                    break;
                } else if (shouldRetry !== undefined && shouldRetry(error) === false) {
                    Lumberjack.error(
                        `Should not retry ${callName} for the current error, rejecting`,
                        telemetryProperties,
                        error);
                    return Promise.reject(error);
                }
                // if maxRetries is -1, we retry indefinitely
                // unless shouldRetry returns false at some point.
                if (maxRetries !== -1 && retryCount >= maxRetries) {
                    Lumberjack.error(`Error after retrying ${retryCount} times, rejecting`, telemetryProperties, error);
                    // Needs to be a full rejection here
                    return Promise.reject(error);
                }

                const intervalMs = calculateIntervalMs(error, retryCount, retryAfterMs);
                await delay(intervalMs);
                retryCount++;
            }
        } while (!success);

        return result;
    } finally {
        if (telemetryEnabled && metric) {
            metric.setProperty("retryCount", retryCount);
            metric.setProperty("callName", callName);
            metric.setProperty("maxRetries", maxRetries);
            metric.setProperty("retryAfterMs", retryAfterMs);
            if (success) {
                metric.success("runWithRetry succeeded");
            } else {
                metric.error("runWithRetry failed", metricError);
            }
        }
    }
}

/**
 * Executes a given request action while providing support for retrying on failures and taking action on error.
 * @remarks
 * The difference between {@link requestWithRetry} and {@link runWithRetry} is that {@link runWithRetry} allows the user
 * to decide whether to ignore the error or not, on a "fire and forget" fashion. That makes the return type of
 * {@link runWithRetry} be slightly different, as `undefined` is a possible return value. That is not the case for
 * {@link requestWithRetry}, which focuses on requests/operations where the user always wants the error to be
 * bubbled up, e.g. network requests. It allows for a simpler return type, `T`, since the function would never return
 * anything other than a `T` value - the only other possibility is a promise rejection.
 * @param request - function to run and retry in case of error
 * @param callName - name of the api function we are calling
 * @param telemetryProperties - telemetry properties to be used by Lumberjack
 * @param shouldRetry - function that takes error and decides whether to retry on it
 * @param maxRetries - maximum retries after which error is thrown. Retry infinitely if set to -1
 * @param retryAfterMs - interval factor to wait before retrying. Param to calculateIntervalMs
 * @param calculateIntervalMs - function which calculates interval to wait before retrying based on error, retryAfterMs
 * and retries so far
 * @param onErrorFn - function allowing caller to define custom logic to run on error e.g. custom logs
 * @param telemetryEnabled - whether to log telemetry metric, default is false
 */
export async function requestWithRetry<T>(
    request: () => Promise<T>,
    callName: string,
    telemetryProperties?: Map<string, any> | Record<string, any>,
    shouldRetry: (error) => boolean = shouldRetryNetworkError,
    maxRetries: number = -1,
    retryAfterMs: number = 1000,
    calculateIntervalMs: (error: any, numRetries: number, retryAfterInterval: number) => number
        = calculateRetryIntervalForNetworkError,
    onErrorFn?: (error) => void,
    telemetryEnabled = false,
): Promise<T> {
    let result: T;
    let retryCount = 0;
    let success = false;
    let metric: Lumber<LumberEventName.RequestWithRetry>;
    let metricError;
    if (telemetryEnabled) {
        metric = Lumberjack.newLumberMetric(
            LumberEventName.RequestWithRetry,
            telemetryProperties);
    }
    try {
        do {
            try {
                result = await request();
                success = true;
                if (retryCount >= 1) {
                    Lumberjack.info(`Succeeded in executing ${callName} with ${retryCount} retries`, telemetryProperties);
                }
            } catch (error) {
                Lumberjack.error(`Error running ${callName}: retryCount ${retryCount}`, telemetryProperties, error);
                if (onErrorFn !== undefined) {
                    onErrorFn(error);
                }
                if (shouldRetry !== undefined && shouldRetry(error) === false) {
                    Lumberjack.error(
                        `Should not retry ${callName} for the current error, rejecting`,
                        telemetryProperties,
                        error);
                    return Promise.reject(error);
                }
                // if maxRetries is -1, we retry indefinitely
                // unless shouldRetry returns false at some point.
                if (maxRetries !== -1 && retryCount >= maxRetries) {
                    Lumberjack.error(`Error after retrying ${retryCount} times, rejecting`, telemetryProperties, error);
                    // Needs to be a full rejection here
                    return Promise.reject(error);
                }

                // TODO: if error is a NetworkError, we should respect NetworkError.retryAfter
                // or NetworkError.retryAfterMs
                const intervalMs = calculateIntervalMs(error, retryCount, retryAfterMs);
                await delay(intervalMs);
                retryCount++;
            }
        } while (!success);

        return result;
    } finally {
        if (telemetryEnabled && metric) {
            metric.setProperty("retryCount", retryCount);
            metric.setProperty("callName", callName);
            metric.setProperty("maxRetries", maxRetries);
            metric.setProperty("retryAfterMs", retryAfterMs);
            if (success) {
                metric.success("requestWithRetry succeeded");
            } else {
                metric.error("requestWithRetry failed", metricError);
            }
        }
    }
}

/**
 * Helper function to decide when or not to retry a {@link NetworkError}.
 * Can be used with {@link runWithRetry} and {@link requestWithRetry}.
 * @param error - the error parameter to be inspected when deciding whether to retry or not.
 */
export function shouldRetryNetworkError(error: any): boolean {
    if (error instanceof Error && error?.name === "NetworkError") {
        const networkError = error as NetworkError;
        return !networkError.isFatal && networkError.canRetry === true;
    }
    return false;
}

/**
 * Helper function that calculates interval to wait before retrying. Leverage's {@link NetworkError.retryAfterMs}
 * if the error is a {@link NetworkError}. Can be used with {@link runWithRetry} and {@link requestWithRetry}.
 * @param error - the error parameter to be inspected. If it is a {@link NetworkError},
 * {@link NetworkError.retryAfterMs} will be used as the retry interval.
 * @param numRetries - the current retry count to be used in exponential backoff calculation.
 * @param retryAfterInterval - default value to be used when calculating the retry interval. Used when
 * {@link NetworkError.retryAfterMs} is not defined.
 */
export function calculateRetryIntervalForNetworkError(
    error: any,
    numRetries: number,
    retryAfterInterval: number): number {
    if (error instanceof Error
        && error?.name === "NetworkError"
        && (error as NetworkError).retryAfterMs) {
        return (error as NetworkError).retryAfterMs;
    }
    return retryAfterInterval * 2 ** numRetries;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { fetchFailureStatusCode, offlineFetchFailureStatusCode } from "@fluidframework/odsp-doclib-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";

/**
 * returns a promise that resolves after timeMs
 */
export async function delay(timeMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), timeMs));
}

export interface CachedResult<T> {
    cacheTime: number;
    result: Promise<T | undefined>;
}

/**
 * A utility function to execute async callback and cache result for given amount of time.
 * If the same function is executed within cache expiry period then cached result is returned.
 * @param asyncCallback - function returning result as a promise
 * @param cacheExpiryTimeMs - time in milliseconds for cached result to be valid
 */
export function asyncWithCache<T>(
    asyncCallback: () => Promise<T | undefined>,
    cacheExpiryTimeMs: number,
): () => Promise<T | undefined> {
    let cache: CachedResult<T> | undefined;
    return async () => {
        const currentTick = performance.now();

        if (cache === undefined || currentTick - cache.cacheTime > cacheExpiryTimeMs) {
            const asyncCallbackResult = asyncCallback();
            cache = {
                cacheTime: currentTick,
                result: asyncCallbackResult,
            };

            // If the result is undefined, clear out the cache.
            asyncCallbackResult
                .then((result) => {
                    if (result === undefined) {
                        cache = undefined;
                    }
                })
                .catch(() => {
                    // We shouldn't cache error states
                    cache = undefined;
                });
        }

        return cache.result;
    };
}

/** Determines how long to wait before retrying
 * retriesAttempted n where the last retry done was the n-th retry, initial request not included.
 * first retry is 0, second is 1 etc.
 */
export type BackoffFunction = (retriesAttempted: number) => number;

export function linearBackoff(backoffTimeMs: number): BackoffFunction {
    return (n: number) => n * backoffTimeMs;
}

export function constantBackoff(backoffTimeMs: number): BackoffFunction {
    return (_: number) => backoffTimeMs;
}

export function exponentialBackoff(backoffTimeMs: number): BackoffFunction {
    return (n: number) => Math.pow(2, n) * backoffTimeMs;
}

export interface AsyncWithRetryResult<T> {
    result: T;
    tries: T[];
}

/** returns true when retriable operation should/can be tried again */
export type RetryFilter<T> = (result: T) => boolean;

export function noRetry(): RetryFilter<any> {
    return () => false;
}

/** Specifies how to do retries */
export interface RetryPolicy<T> {
    /** max number of retries to attempt, excludes initial request */
    maxRetries: number;
    /** Should return true when a retry is wanted and false otherwise */
    filter: RetryFilter<T>;
    /** backoff function */
    backoffFn: BackoffFunction;
}

/** Specifies how to handle timeout */
export interface TimeoutPolicy<T> {
    /** Milliseconds to pass before attempt is considered to be timed out */
    timeoutMs: number;
    /** Function that is called upon timeout */
    onTimeout: () => T;
}

/**
 * A utility function to execute async callback with support for retries and timeout
 * @param asyncCallback - function returning result as a promise
 * @param retryPolicy - how to do retries
 * @param timeoutPolicy - how to treat timeout
 */
export async function asyncWithRetry<T>(
    asyncCallback: (retryAttempt: number) => Promise<T>,
    retryPolicy?: RetryPolicy<T>,
    timeoutPolicy?: TimeoutPolicy<T>,
): Promise<AsyncWithRetryResult<T>> {
    return asyncWithRetryImpl(asyncCallback, [], retryPolicy, timeoutPolicy);
}

/**
 * Should not be used directly
 */
async function asyncWithRetryImpl<T>(
    asyncCallback: (retryAttempt: number) => Promise<T>,
    tries: T[],
    retryPolicy?: RetryPolicy<T>,
    timeoutPolicy?: TimeoutPolicy<T>,
): Promise<AsyncWithRetryResult<T>> {
    let result: T;
    const promiseArr = [
        asyncCallback(tries.length).then((callbackResult) => {
            result = callbackResult;
            return false;
        }),
    ];

    if (timeoutPolicy && timeoutPolicy.timeoutMs > 0) {
        promiseArr.push(delay(timeoutPolicy.timeoutMs).then(() => true));
    }

    return Promise.race(promiseArr).then((timedOut) => {
        // Execute onTimeout callback in case asyncCallback did not complete in time
        if (timedOut) {
            result = timeoutPolicy!.onTimeout();
        }
        if (!retryPolicy || !retryPolicy.filter(result) || tries.length >= retryPolicy.maxRetries) {
            return { result, tries };
        }
        return delay(retryPolicy.backoffFn(tries.length)).then(async () => {
            tries.push(result);
            return asyncWithRetryImpl(asyncCallback, tries, retryPolicy, timeoutPolicy);
        });
    });
}

export type FetchWithRetryResponse = AsyncWithRetryResult<FetchResponse>;

/**
 * Creates a filter that will allow retries for the allowed status codes
 * @param retriableCodes - Cannot be null/undefined
 */
export function allowlist(retriableCodes: number[]): RetryFilter<Response> {
    return (response: Response) => response && retriableCodes.includes(response.status);
}

/**
 * Creates a filter that will allow retries for everything except codes on the deny list
 * @param nonRetriableCodes - Cannot be null/undefined
 */
export function denylist(nonRetriableCodes: number[]): RetryFilter<Response> {
    return (response: Response) => response && !nonRetriableCodes.includes(response.status);
}

/**
 * A utility function to do fetch with support for retries. Note that this function does not
 * reject the returned promise if fetch fails. Clients are expected to inspect the status in
 * the response to determine if the fetch succeeded or not.
 * @param requestInfo - fetch requestInfo, can be a string
 * @param requestInit - fetch requestInit
 * @param name - name of the request to use for logging
 * @param logger - used to log results of operation, including any error
 * @param retryPolicy - how to do retries
 * @param timeoutMs - time in milliseconds to treat fetch as timed out
 * @param getAdditionalProps - optional callback used to get additional properties that get logged about the request
 */
export async function fetchWithRetry(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
    nameForLogging: string,
    logger?: ITelemetryLogger,
    retryPolicy?: RetryPolicy<Response>,
    timeoutMs = 0,
    getAdditionalProps?: (response: Response, isFinalAttempt: boolean) => Promise<ITelemetryProperties>,
): Promise<FetchWithRetryResponse> {
    return asyncWithRetry<FetchResponse>(
        async () => {
            const startTime = performance.now();
            return fetch(requestInfo, requestInit)
                .then((response) => {
                    // We cannot use the spread syntax here since the response object is non enumerable
                    const fetchResponse = response as FetchResponse;
                    fetchResponse.durationMs = Math.round(performance.now() - startTime);
                    return fetchResponse;
                })
                .catch((_) => {
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    return {
                        status: !window.navigator.onLine ? offlineFetchFailureStatusCode : fetchFailureStatusCode,
                        ok: false,
                        durationMs: Math.round(performance.now() - startTime),
                    } as FetchResponse;
                });
        },
        retryPolicy,
        {
            timeoutMs,
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            onTimeout: () => { return { status: 707, ok: false, durationMs: timeoutMs } as FetchResponse;},
        },
    ).then((fetchWithRetryResponse) => {
        // The latest response is in result, and is attempted after tries.length number of prior attempts.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        logFetchResponse(
            nameForLogging,
            true /* isFinalAttempt */,
            fetchWithRetryResponse.result,
            fetchWithRetryResponse.tries.length + 1,
            logger,
            getAdditionalProps,
        );

        fetchWithRetryResponse.tries.forEach((fetchResponse, attempt) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            logFetchResponse(
                nameForLogging,
                false /* isFinalAttempt */,
                fetchResponse,
                attempt + 1,
                logger,
                getAdditionalProps,
            );
        });
        return fetchWithRetryResponse;
    });
}

async function logFetchResponse(
    nameForLogging: string,
    isFinalAttempt: boolean,
    response: FetchResponse,
    attempt: number,
    logger?: ITelemetryLogger,
    getAdditionalProps?: (response: Response, isFinalAttempt: boolean) => Promise<ITelemetryProperties>,
) {
    if (logger !== undefined) {
        const additionalProps = getAdditionalProps && (await getAdditionalProps(response, isFinalAttempt));
        const childLogger = ChildLogger.create(logger, "Request");
        childLogger.sendTelemetryEvent({
            eventName: nameForLogging,
            isFinalAttempt,
            status: response.status,
            durationMs: response.durationMs,
            size: (response.headers && response.headers.get("Content-Length")) || -1,
            attempt,
            ...additionalProps,
        });
    }
}

export interface FetchResponse extends Response {
    durationMs: number;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@prague/container-definitions";

async function delay(timeMs: number): Promise<void> {
  return new Promise((resolve: () => void) => setTimeout(resolve, timeMs));
}

/** Determines how long to wait before retrying
 * retriesAttempted n where the last retry done was the n-th retry,
 *  initial request not included. first retry is 0, second is 1 etc.
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

// tslint:disable-next-line: interface-name
export interface AsyncWithRetryResult<T> {
  result: T;
  tries: T[];
}

// returns true when retriable operation should/can be tried again
export type RetryFilter<T> = (result: T) => boolean;

export function noRetry(): RetryFilter<any> {
  return () => false;
}

/**
 *  Specifies how to do retries
 */
// tslint:disable-next-line: interface-name
export interface RetryPolicy<T> {
  // max number of retries to attempt, excludes initial request
  maxRetries: number;
  // Should return true when a retry is wanted and false otherwise
  filter: RetryFilter<T>;
  // backoff function */
  backoffFn: BackoffFunction;
  // timeout per try
  timeoutMs?: number;
}

const defaultRetryPolicy: RetryPolicy<any> = {
  maxRetries: 0,
  // tslint:disable-next-line: object-literal-sort-keys
  filter: noRetry(),
  backoffFn: () => 0,
};

/**
 * A utility function to execute async callback with support for retries
 * @param asyncCallback function returning result as a promise
 * @param retryPolicy how to do retries
 * @param onTimeout called upon timeout
 */
export async function asyncWithRetry<T>(
  asyncCallback: (retryAttempt: number) => Promise<T>,
  retryPolicy: RetryPolicy<T> = defaultRetryPolicy,
  onTimeout: () => T,
): Promise<AsyncWithRetryResult<T>> {
  return asyncWithRetryImpl(asyncCallback, retryPolicy, onTimeout, []);
}

/**
 * Should not be used directly
 */
async function asyncWithRetryImpl<T>(
  asyncCallback: (retryAttempt: number) => Promise<T>,
  retryPolicy: RetryPolicy<T>,
  onTimeout: () => T,
  tries: T[],
): Promise<AsyncWithRetryResult<T>> {
  const promiseArr = [asyncCallback(tries.length)];
  if (retryPolicy.timeoutMs) {
    const timeoutPromise = delay(retryPolicy.timeoutMs).then(onTimeout);
    promiseArr.push(timeoutPromise);
  }
  return Promise.race(promiseArr).then((result) => {
    if (!retryPolicy.filter(result) || tries.length >= retryPolicy.maxRetries) {
      return { result, tries };
    }
    return delay(retryPolicy.backoffFn(tries.length)).then(async () => {
      tries.push(result);
      return asyncWithRetryImpl(asyncCallback, retryPolicy, onTimeout, tries);
    });
  });
}

export type FetchWithRetryResponse = AsyncWithRetryResult<FetchResponse>;

/**
 * Creates a filter that will allow retries for the whitelisted status codes
 * @param retriableCodes Cannot be null/undefined
 */
export function whitelist(retriableCodes: number[]): RetryFilter<Response> {
  return (response: Response) => response && retriableCodes.includes(response.status);
}

/**
 * Creates a filter that will allow retries for everything except codes on the blacklist
 * @param nonRetriableCodes Cannot be null/undefined
 */
export function blacklist(nonRetriableCodes: number[]): RetryFilter<Response> {
  return (response: Response) => response && !nonRetriableCodes.includes(response.status);
}

/**
 * A utility function to do fetch with support for retries. Note that this function does not reject the
 * returned promise if fetch fails. Clients are expected to inspect the status in the response to determine
 * if the fetch succeeded or not.
 * @param requestInfo fetch requestInfo, can be a string
 * @param requestInit fetch requestInit
 * @param retryPolicy how to do retries
 * @param name name of the request to use for logging
 * @param logger logger to use for logging
 * @param getAdditionalProps optional callback used to get additional properties that get logged about the request
 */
export async function fetchWithRetry(
  requestInfo: RequestInfo,
  requestInit: RequestInit | undefined,
  retryPolicy: RetryPolicy<Response> = defaultRetryPolicy,
  nameForLogging: string,
  logger: ITelemetryBaseLogger,
  getAdditionalProps?: (response: Response, isFinalAttempt: boolean) => Promise<ITelemetryBaseEvent>,
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
          // Use 706 as status code when browser is offline, -1 for other fetch promise rejections
          // tslint:disable-next-line: no-object-literal-type-assertion
          return {
            status: !window.navigator.onLine ? 706 : -1,
            // tslint:disable-next-line: object-literal-sort-keys
            ok: false,
            durationMs: Math.round(performance.now() - startTime),
          } as FetchResponse;
        });
    },
    retryPolicy,
    // tslint:disable-next-line: no-object-literal-type-assertion
    () => ({ status: 707, ok: false, durationMs: retryPolicy.timeoutMs } as FetchResponse),
  ).then((fetchWithRetryResponse) => {
    // The latest response is in result, and is attempted after tries.length number of prior attempts.
    logFetchResponse(
      logger,
      nameForLogging,
      true /* isFinalAttempt */,
      fetchWithRetryResponse.result,
      fetchWithRetryResponse.tries.length + 1,
      getAdditionalProps,
    );

    fetchWithRetryResponse.tries.forEach((fetchResponse, attempt) => {
      logFetchResponse(
        logger,
        nameForLogging,
        false /* isFinalAttempt */,
        fetchResponse,
        attempt + 1,
        getAdditionalProps,
      );
    });
    return fetchWithRetryResponse;
  });
}

async function logFetchResponse(
  logger: ITelemetryBaseLogger,
  nameForLogging: string,
  isFinalAttempt: boolean,
  response: FetchResponse,
  attempt: number,
  getAdditionalProps?: (response: Response, isFinalAttempt: boolean) => Promise<ITelemetryBaseEvent>,
) {
  const additionalProps = getAdditionalProps && (await getAdditionalProps(response, isFinalAttempt));
  logger.send({
    category: "generic",
    eventName: "Request",
    name: nameForLogging,
    // tslint:disable-next-line: object-literal-sort-keys
    isFinalAttempt,
    status: response.status,
    durationMs: response.durationMs,
    size: (response.headers && response.headers.get("Content-Length")) || -1,
    attempt,
    ...additionalProps,
  });
}

// tslint:disable-next-line: interface-name
interface FetchResponse extends Response {
  durationMs: number;
}

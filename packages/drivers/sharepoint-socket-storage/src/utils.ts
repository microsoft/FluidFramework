export function exponentialBackoff(backoffTimeMs: number): BackoffFunction {
    return (n: number) => Math.pow(2, n) * backoffTimeMs;
}

/** Determines how long to wait before retrying
 * retriesAttempted n where the last retry done was the n-th retry, initial request not included.
 * first retry is 0, second is 1 etc.
 */
export type BackoffFunction = (retriesAttempted: number) => number;

/**
 * returns a promise that resolves after timeMs
 * @param timeMs - time for delay
 */
export async function delay(timeMs: number): Promise<void> {
    // tslint:disable-next-line: no-string-based-set-timeout
    return new Promise((resolve) => setTimeout(resolve, timeMs));
}

/**
 * returns true when the request should/can be retried
 */
export type RetryFilter = (response: Response) => boolean;

export function noRetry(): RetryFilter {
    return () => false;
}

/**
 * Specifies how to do retries
 */
export interface IRetryPolicy {
    // max number of retries to attempt, excludes initial request
    maxRetries: number;
    // Should return true when a retry is wanted and false otherwise
    filter: RetryFilter;
    // backoff function
    backoffFn: BackoffFunction;
    // timeout per try
    timeoutMs?: number;
}

export interface IFetchWithRetryResponse {
    response: Response;
    tries: Response[];
}

const defaultRetryPolicy: IRetryPolicy = {
    backoffFn: () => 0,
    filter: noRetry(),
    maxRetries: 0,
};

/**
 * A utility function to do fetch with support for retries
 * @param url fetch requestInfo, can be a string
 * @param requestInit fetch requestInit
 * @param retryPolicy how to do retries
 */
export function fetchWithRetry(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
    retryPolicy: IRetryPolicy = defaultRetryPolicy,
): Promise<IFetchWithRetryResponse> {
    return fetchWithRetryImpl(requestInfo, requestInit, retryPolicy, []);
}

/**
 * Should not be used directly
 */
function fetchWithRetryImpl(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
    retryPolicy: IRetryPolicy,
    tries: Response[],
): Promise<IFetchWithRetryResponse> {
    const promiseArr = [fetch(requestInfo, requestInit)];
    if (retryPolicy.timeoutMs) {
        const timeoutPromise = delay(retryPolicy.timeoutMs).then(() => {
            // tslint:disable-next-line: no-object-literal-type-assertion
            return { status: 707, ok: false } as Response;
        });
        promiseArr.push(timeoutPromise);
    }
    return Promise.race(promiseArr).then((response) => {
        if (!response || response.ok || !retryPolicy.filter(response) || tries.length >= retryPolicy.maxRetries) {
            return { response, tries };
        }
        return delay(retryPolicy.backoffFn(tries.length)).then(() => {
            tries.push(response);
            return fetchWithRetryImpl(requestInfo, requestInit, retryPolicy, tries);
        });
    });
}

/**
 * Creates a filter that will allow retries for the whitelisted status codes
 * @param retriableCodes Cannot be null/undefined
 */
export function whitelist(retriableCodes: number[]): RetryFilter {
    return (response: Response) => retriableCodes.includes(response.status);
}

export function getWithRetryForTokenRefresh<T>(get: (refresh: boolean) => Promise<T>) {
    return get(false).catch(async (e) => {
        // if the error is 401 or 403 refresh the token and try once more.
        if (e === 401 || e === 403) {
            return get(true);
        }

        console.error(e);
        return (undefined as any) as T;
    });
}

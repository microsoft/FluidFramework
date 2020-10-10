/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { RetryPolicy, FetchWithRetryResponse, fetchWithRetry } from "./fetchWithRetry";
import { parseAuthErrorClaims } from "./parseAuthErrorClaims";
import { TokenFetchOptions, tokenFromResponse, TokenResponse } from "./tokenFetch";

export interface AuthorizedRequestTokenPolicy {
    /**
     * Token scheme used when token is passed via Authorization header
     */
    readonly scheme: string;
    /**
     * Optional query param name used to pass token value. Should be specified for endpoints
     * that accept token via query param. This is used as optimization technique to prevent
     * pre-flight request which is made under cross-origin condition due to use of Authorization header.
     */
    readonly queryParam?: string;
    /**
     * Optional value indicating the max number of characters in request query params.
     * Some end points have limit on query params length: when exceeded request will not be passed
     * to service end which result in fetch failure. If queryParam and doNotExceedQueryParamsLength
     * properties are both specified then overall length of query params is determined, including
     * token value. If calculated value exceeds doNotExceedQueryParamsLength then fetch method
     * must fallback to using Authorization header.
     */
    readonly doNotExceedQueryParamsLength?: number;
}

/**
 * Default token policy which results in passing token value via Authorization request
 */
const defaultAuthorizedRequestTokenPolicy: AuthorizedRequestTokenPolicy = { scheme: "Bearer" };

export interface  AuthorizedFetchProps {
    /**
     * Callback function which is used to get token which will be appended to authorized request
     */
    readonly getToken: (options: TokenFetchOptions) => Promise<string | TokenResponse | null>;
    /**
     * Optional policy describing how token value is passed with authorized request.
     * If not specified then default policy is used which passes token via Authorization header with Bearer scheme.
     */
    readonly tokenPolicy?: AuthorizedRequestTokenPolicy;
    /**
     * Fetch request absolute url
     */
    readonly url: string;
    /**
     * Fetch request initializer which provides request details such as request method, body, headers.
     * If not specified then assuming GET request without any additional headers.
     */
    readonly requestInit?: RequestInit;
    /**
     * Optional retry policy which is applied in case of fetch failure
     */
    readonly retryPolicy?: RetryPolicy<Response>;
    /**
     * Optional time in milliseconds to treat fetch as timed out
     */
    readonly timeoutMs?: number;
    /**
     * Used to log results of operation, including any error
     */
    readonly logger?: ITelemetryLogger;
    /**
     * Name of the request to use for logging. Must be specified if logger is specified.
     */
    readonly nameForLogging?: string;
    /**
     * Optional callback used to get additional properties that get logged about the request
     */
    readonly getAdditionalProps?: (response: Response, isFinalAttempt: boolean) => Promise<ITelemetryProperties>;
}

/**
 * A utility function to do authorized fetch with retry. Authorized fetch requires auth token to be included
 * with request. This function supports long lived tokens and handles token refresh in case of authorization
 * failure due to insufficient claims. Note that this function does not reject the returned promise if fetch fails.
 * Clients are expected to inspect the status in the response to determine if the fetch succeeded or not.
 * @param props - set of properties describing fetch behavior
 * @returns promise to fetch response
 */
export async function authorizedFetchWithRetry(props: AuthorizedFetchProps): Promise<FetchWithRetryResponse> {
    return authorizedFetchWithRetryImpl(props);
}

const maxTokenFetchesDueToInsufficientClaims = 3;

async function authorizedFetchWithRetryImpl(
    props: AuthorizedFetchProps,
    tokenFetchOptions?: TokenFetchOptions,
    attempt = 1,
): Promise<FetchWithRetryResponse> {
    const token = tokenFromResponse(await props.getToken(tokenFetchOptions ?? { refresh: false }));
    if (!token) {
        throw new Error("Authorized fetch aborted due to failure to acquire access token");
    }

    const { url, requestInit, retryPolicy, timeoutMs, logger, nameForLogging, getAdditionalProps } = props;
    const tokenPolicy = props.tokenPolicy ?? defaultAuthorizedRequestTokenPolicy;

    if (logger && !nameForLogging) {
        throw new Error("Authorized fetch aborted due to missing nameForLogging");
    }

    // Determine if token can be passed via query param and augment request url accordingly
    let passTokenViaQueryParam = false;
    const augmentedUrl = new URL(url);
    if (tokenPolicy.queryParam) {
        augmentedUrl.searchParams.set(tokenPolicy.queryParam, token);
        passTokenViaQueryParam =
            !tokenPolicy.doNotExceedQueryParamsLength ||
            augmentedUrl.search.length < tokenPolicy.doNotExceedQueryParamsLength;
        if (!passTokenViaQueryParam) {
            augmentedUrl.searchParams.delete(tokenPolicy.queryParam);
        }
    }

    // Include Authorization header with request unless token is passed via query param
    let augmentedRequest = requestInit;
    if (!passTokenViaQueryParam) {
        augmentedRequest = { ...requestInit };
        augmentedRequest.headers = { ...augmentedRequest.headers, Authorization: `${tokenPolicy.scheme} ${token}` };
    }

    // This method will check for authorization error and detect the case when new token must be fetched
    // due to insufficient claims. This accounts for use of long lived token which might become invalid
    // while its life time has not expired yet.
    const insufficientClaimsFn = (response: Response) =>
        (response.status === 401 && parseAuthErrorClaims(response.headers)) || undefined;

    // Augment retry policy to exclude case where insufficient claims error is returned
    let augmentedRetryPolicy: RetryPolicy<Response> | undefined;
    if (retryPolicy) {
        augmentedRetryPolicy = {
            ...retryPolicy,
            filter: (response: Response) => !insufficientClaimsFn(response) && retryPolicy.filter(response),
        };
    }

    const fetchResponse = await fetchWithRetry(
        augmentedUrl.href,
        augmentedRequest,
        nameForLogging || "Unknown",
        logger,
        augmentedRetryPolicy,
        timeoutMs,
        getAdditionalProps,
    );

    const insufficientClaims = insufficientClaimsFn(fetchResponse.result);
    if (insufficientClaims) {
        if (insufficientClaims && attempt < maxTokenFetchesDueToInsufficientClaims) {
            return authorizedFetchWithRetryImpl(props, { claims: insufficientClaims, refresh: false }, attempt + 1);
        }
    }

    return fetchResponse;
}

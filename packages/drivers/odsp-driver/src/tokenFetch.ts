/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents token response
 */
export interface TokenResponse {
    /** Token value */
    token: string;

    /** Flag indicating whether token was obtained from local cache */
    fromCache?: boolean;
}

/**
 * Represents token fetch options
 */
export interface TokenFetchOptions {
    /**
     * Value indicating whether fresh token has to be returned.
     * If false then it is okay to return cached unexpired token if available.
     */
    refresh: boolean;

    /** Claims that have to be passed with token fetch request */
    claims?: string;
}

/**
 * Method signature for callback method used to fetch Storage token
 * @param siteUrl - Storage site url
 * @param refresh - Flag indicating whether token fetch must bypass local cache
 * @param claims - Optional string indicating claims that will be passed to token authority
 * @returns If successful, TokenResponse object representing token value along with flag indicating
 * whether token came from cache. Legacy implementation may return a string for token value;
 * in this case it should be assumes that fromCache signal is undefined. Null is returned in case of failure.
 */
// eslint-disable-next-line max-len
export type StorageTokenFetcher = (siteUrl: string, refresh: boolean, claims?: string) => Promise<string | TokenResponse | null>;

/**
 * Method signature for callback method used to fetch Push token
 * @param refresh - Flag indicating whether token fetch must bypass local cache
 * @param claims - Optional string indicating claims that will be passed to token authority
 * @returns If successful, TokenResponse object representing token value along with flag indicating
 * whether token came from cache. Legacy implementation may return a string for token value;
 * in this case it should be assumes that fromCache signal is undefined. Null is returned in case of failure.
 */
export type PushTokenFetcher = (refresh: boolean, claims?: string) => Promise<string | TokenResponse | null>;

/**
 * Method signature for callback method used to fetch Sharing link token
 * @param siteUrl - Storage site url
 * @param scopeFor - to determine the scope of the token to fetch the share link.
 * @param refresh - Flag indicating whether token fetch must bypass local cache
 * @param claims - Optional string indicating claims that will be passed to token authority
 * @returns If successful, TokenResponse object representing token value along with flag indicating
 * whether token came from cache. Legacy implementation may return a string for token value;
 * in this case it should be assumes that fromCache signal is undefined. Null is returned in case of failure.
 */
export type SharingLinkTokenFetcher =
    (siteUrl: string, scopeFor: SharingLinkScopeFor, refresh: boolean, claims?: string)
        => Promise<string | TokenResponse | null>;

export enum SharingLinkScopeFor {
    fileDefaultUrl = "fileDefaultUrl",
    nonFileDefaultUrl = "nonFileDefaultUrl",
}

/**
 * Helper method which transforms return value for StorageTokenFetcher and PushTokenFetcher to token string
 * @param tokenResponse - return value for StorageTokenFetcher and PushTokenFetcher methods
 * @returns Token value
 */
export function tokenFromResponse(tokenResponse: string | TokenResponse | null | undefined): string | null {
    return tokenResponse === null || typeof tokenResponse === "string"
        ? tokenResponse
        : tokenResponse === undefined ? null : tokenResponse.token;
}

/**
 * Helper method which returns flag indicating whether token response comes from local cache
 * @param tokenResponse - return value for StorageTokenFetcher and PushTokenFetcher methods
 * @returns Value indicating whether response came from cache.
 * Undefined is returned when we could not determine the source of token.
 */
export function isTokenFromCache(tokenResponse: string | TokenResponse | null): boolean | undefined {
    return tokenResponse === null || typeof tokenResponse === "string"
        ? undefined
        : tokenResponse.fromCache;
}

export type IdentityType = "Consumer" | "Enterprise";

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
 * Method signature for callback method used to fetch access token
 * @param options - token fetch options
 * @returns If successful, TokenResponse object representing token value along with flag indicating
 * whether token came from cache. Legacy implementation may return a string for token value;
 * in this case it should be assumes that fromCache signal is undefined. Null is returned in case of failure.
 */
export type TokenFetcher = (options: TokenFetchOptions) => Promise<string | TokenResponse | null>;

export interface ResourceTokenFetchOptions extends TokenFetchOptions {
    /** Site url representing resource location */
    siteUrl: string;
}

/**
 * Method signature for callback method used to fetch token for resource with location represented by site url
 * @param options - token fetch options
 * @returns If successful, TokenResponse object representing token value along with flag indicating
 * whether token came from cache. Legacy implementation may return a string for token value;
 * in this case it should be assumes that fromCache signal is undefined. Null is returned in case of failure.
 */
export type ResourceTokenFetcher = (options: ResourceTokenFetchOptions) => Promise<string | TokenResponse | null>;

export interface GraphResourceTokenFetchOptions extends ResourceTokenFetchOptions {
    type: "Graph";
}

export interface OneDriveResourceTokenFetchOptions extends ResourceTokenFetchOptions {
    type: "OneDrive";
}

export type SharingLinkTokenFetchOptions = GraphResourceTokenFetchOptions | OneDriveResourceTokenFetchOptions;

/**
 * Method signature for callback method used to fetch Sharing link token
 * @param options - token fetch options
 * @returns If successful, TokenResponse object representing token value along with flag indicating
 * whether token came from cache. Legacy implementation may return a string for token value;
 * in this case it should be assumes that fromCache signal is undefined. Null is returned in case of failure.
 */
export type SharingLinkTokenFetcher = (options: SharingLinkTokenFetchOptions) => Promise<string | TokenResponse | null>;

/**
 * Helper method which transforms return value for TokenFetcher method to token string
 * @param tokenResponse - return value for TokenFetcher method
 * @returns Token value
 */
export function tokenFromResponse(tokenResponse: string | TokenResponse | null | undefined): string | null {
    return tokenResponse === null || typeof tokenResponse === "string"
        ? tokenResponse
        : tokenResponse === undefined ? null : tokenResponse.token;
}

/**
 * Helper method which returns flag indicating whether token response comes from local cache
 * @param tokenResponse - return value for TokenFetcher method
 * @returns Value indicating whether response came from cache.
 * Undefined is returned when we could not determine the source of token.
 */
export function isTokenFromCache(tokenResponse: string | TokenResponse | null): boolean | undefined {
    return tokenResponse === null || typeof tokenResponse === "string"
        ? undefined
        : tokenResponse.fromCache;
}

export type IdentityType = "Consumer" | "Enterprise";

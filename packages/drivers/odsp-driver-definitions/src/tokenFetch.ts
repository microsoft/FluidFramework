/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents token response
 * @beta
 */
export interface TokenResponse {
	/** Token value */
	token: string;

	/** Flag indicating whether token was obtained from local cache */
	fromCache?: boolean;
}

/**
 * Represents access token fetch options
 * @alpha
 */
export interface TokenFetchOptions {
	/**
	 * Value indicating whether fresh token has to be returned.
	 * If false then it is okay to return cached unexpired token if available.
	 */
	refresh: boolean;

	/**
	 * Claims that have to be passed with token fetch request.
	 * These can be used to specify additional information that must be passed to token authority.
	 */
	claims?: string;

	/**
	 * Tenant id of authority that must be handling token fetch.
	 * If it is not specified then it is up to token fetching logic to determine which tenant authority
	 * to use to issue access token.
	 */
	tenantId?: string;
}

/**
 * Represents access token fetch options for ODSP resource
 * @alpha
 */
export interface OdspResourceTokenFetchOptions extends TokenFetchOptions {
	/** Site url representing ODSP resource location */
	siteUrl: string;

	/** ODSP drive id where resource resides. Optional, used only when fetching token to access ODSP file */
	driveId?: string;

	/** ODSP item id representing resource. Optional, used only when fetching token to access ODSP file */
	itemId?: string;
}

/**
 * Method signature for callback method used to fetch access token
 * @param options - token fetch options
 * @returns If successful, TokenResponse object representing token value along with flag indicating
 * whether token came from cache. Legacy implementation may return a string for token value;
 * in this case it should be assumes that fromCache signal is undefined. Null is returned in case of failure.
 * @alpha
 */
export type TokenFetcher<T> = (options: T) => Promise<string | TokenResponse | null>;

/**
 * Helper method which transforms return value for TokenFetcher method to token string
 * @param tokenResponse - return value for TokenFetcher method
 * @returns Token value
 * @internal
 */
export const tokenFromResponse = (
	tokenResponse: string | TokenResponse | null | undefined,
): string | null =>
	tokenResponse === null || typeof tokenResponse === "string"
		? tokenResponse
		: tokenResponse === undefined
		? null
		: tokenResponse.token;

/**
 * Helper method which returns flag indicating whether token response comes from local cache
 * @param tokenResponse - return value for TokenFetcher method
 * @returns Value indicating whether response came from cache.
 * Undefined is returned when we could not determine the source of token.
 * @internal
 */
export const isTokenFromCache = (
	tokenResponse: string | TokenResponse | null,
): boolean | undefined =>
	tokenResponse === null || typeof tokenResponse === "string"
		? undefined
		: tokenResponse.fromCache;

/**
 * Identity types supported by ODSP driver.
 * `Consumer` represents user authenticated with Microsoft Account (MSA).
 * `Enterprise` represents user authenticated with M365 tenant account.
 * @alpha
 */
export type IdentityType = "Consumer" | "Enterprise";

/**
 * @internal
 */
export type InstrumentedStorageTokenFetcher = (
	options: TokenFetchOptions,
	name: string,
	alwaysRecordTokenFetchTelemetry?: boolean,
) => Promise<string | null>;

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidError } from "@fluidframework/telemetry-utils/internal";

import { getAadTenant, getAadUrl, getSiteUrl } from "./odspDocLibUtils.js";
import { throwOdspNetworkError } from "./odspErrorUtils.js";
import { unauthPostAsync } from "./odspRequest.js";

/**
 * @internal
 */
export interface IOdspTokens {
	readonly accessToken: string;
	readonly refreshToken: string;
}

/**
 * Configuration for a public client.
 * @internal
 */
export interface IPublicClientConfig {
	clientId: string;
}

/**
 * @legacy
 * @alpha
 */
export interface IOdspAuthRequestInfo {
	accessToken: string;
	refreshTokenFn?: () => Promise<string>;
}

/**
 * @internal
 */
export type TokenRequestCredentials =
	| {
			grant_type: "authorization_code";
			code: string;
			redirect_uri: string;
	  }
	| {
			grant_type: "refresh_token";
			refresh_token: string;
	  }
	| {
			grant_type: "password";
			username: string;
			password: string;
	  };

type TokenRequestBody = TokenRequestCredentials & {
	client_id: string;
	scope: string;
};

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @legacy
 * @alpha
 */
export const getOdspScope = (server: string): string =>
	`offline_access ${getSiteUrl(server)}/AllSites.Write`;
/**
 * @legacy
 * @alpha
 */
export const pushScope =
	"offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function getFetchTokenUrl(server: string): string {
	return `${getAadUrl(server)}/${getAadTenant(server)}/oauth2/v2.0/token`;
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function getLoginPageUrl(
	server: string,
	clientConfig: IPublicClientConfig,
	scope: string,
	odspAuthRedirectUri: string,
): string {
	return (
		`${getAadUrl(server)}/${getAadTenant(server)}/oauth2/v2.0/authorize?` +
		`client_id=${clientConfig.clientId}` +
		`&scope=${scope}` +
		`&response_type=code` +
		`&redirect_uri=${odspAuthRedirectUri}`
	);
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export const getOdspRefreshTokenFn = (
	server: string,
	clientConfig: IPublicClientConfig,
	tokens: IOdspTokens,
): (() => Promise<string>) =>
	getRefreshTokenFn(getOdspScope(server), server, clientConfig, tokens);

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export const getPushRefreshTokenFn = (
	server: string,
	clientConfig: IPublicClientConfig,
	tokens: IOdspTokens,
): (() => Promise<string>) => getRefreshTokenFn(pushScope, server, clientConfig, tokens);

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export const getRefreshTokenFn =
	(
		scope: string,
		server: string,
		clientConfig: IPublicClientConfig,
		tokens: IOdspTokens,
	): (() => Promise<string>) =>
	async (): Promise<string> => {
		const newTokens = await refreshTokens(server, scope, clientConfig, tokens);
		return newTokens.accessToken;
	};

/**
 * Fetch an access token and refresh token from AAD
 * @param server - The server to auth against
 * @param scope - The desired oauth scope
 * @param clientConfig - Info about this client's identity
 * @param credentials - Credentials authorizing the client for the requested token
 * @internal
 */
export async function fetchTokens(
	server: string,
	scope: string,
	clientConfig: IPublicClientConfig,
	credentials: TokenRequestCredentials,
): Promise<IOdspTokens> {
	const body: TokenRequestBody = {
		scope,
		client_id: clientConfig.clientId,
		...credentials,
	};
	const response = await unauthPostAsync(
		getFetchTokenUrl(server),
		new URLSearchParams(body), // This formats the body like a query string which is the expected format
	);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO: use stronger typing here.
	const parsedResponse = await response.json();
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
	const accessToken = parsedResponse.access_token;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
	const refreshToken = parsedResponse.refresh_token;

	if (accessToken === undefined || refreshToken === undefined) {
		try {
			throwOdspNetworkError(
				// pre-0.58 error message: unableToGetAccessToken
				"Unable to get access token.",
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				parsedResponse.error === "invalid_grant" ? 401 : response.status,
				response,
			);
		} catch (error) {
			if (isFluidError(error) && isAccessTokenError(parsedResponse)) {
				error.addTelemetryProperties({
					innerError: parsedResponse.error,
					errorDescription: parsedResponse.error_description,
					code: JSON.stringify(parsedResponse.error_codes),
					timestamp: parsedResponse.timestamp,
					traceId: parsedResponse.trace_id,
					correlationId: parsedResponse.correlation_id,
				});
			}
			throw error;
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	return { accessToken, refreshToken };
}

/**
 * See https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow#error-response-1
 * for documentation on these values.
 *
 * Error codes can also be looked up using https://login.microsoftonline.com/error
 */
interface AadOauth2TokenError {
	error: string;
	error_codes: string[];
	error_description: string;
	timestamp: string;
	trace_id: string;
	correlation_id: string;
}

function isAccessTokenError(parsedResponse: unknown): parsedResponse is AadOauth2TokenError {
	return (
		typeof (parsedResponse as Partial<AadOauth2TokenError>).error === "string" &&
		Array.isArray((parsedResponse as Partial<AadOauth2TokenError>).error_codes)
	);
}

/**
 * Fetch fresh tokens.
 * @param server - The server to auth against
 * @param scope - The desired oauth scope
 * @param clientConfig - Info about this client's identity
 * @param tokens - The tokens object provides the refresh token for the request
 *
 * @returns The tokens object with refreshed tokens.
 * @internal
 */
export async function refreshTokens(
	server: string,
	scope: string,
	clientConfig: IPublicClientConfig,
	tokens: IOdspTokens,
): Promise<IOdspTokens> {
	// Clear out the old tokens while awaiting the new tokens
	const refresh_token = tokens.refreshToken;
	assert(refresh_token.length > 0, 0x1ec /* "No refresh token provided." */);

	const credentials: TokenRequestCredentials = {
		grant_type: "refresh_token",
		refresh_token,
	};
	const newTokens = await fetchTokens(server, scope, clientConfig, credentials);

	// Instead of returning, update the passed in tokens object
	return { accessToken: newTokens.accessToken, refreshToken: newTokens.refreshToken };
}

const createConfig = (token: string): RequestInit => ({
	headers: { Authorization: `Bearer ${token}` },
});

/**
 * Issue the requestCallback, providing the proper auth header based on authRequestInfo,
 * and retrying with a refreshed token if necessary.
 * @internal
 */
export async function authRequestWithRetry(
	authRequestInfo: IOdspAuthRequestInfo,
	requestCallback: (config: RequestInit) => Promise<Response>,
): Promise<Response> {
	const result = await requestCallback(createConfig(authRequestInfo.accessToken));

	if (authRequestInfo.refreshTokenFn && (result.status === 401 || result.status === 403)) {
		// Unauthorized, try to refresh the token
		const refreshedAccessToken = await authRequestInfo.refreshTokenFn();
		return requestCallback(createConfig(refreshedAccessToken));
	}
	return result;
}

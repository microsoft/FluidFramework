/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { isFluidError } from "@fluidframework/telemetry-utils";
import { getAadTenant, getAadUrl, getSiteUrl } from "./odspDocLibUtils";
import { throwOdspNetworkError } from "./odspErrorUtils";
import { unauthPostAsync } from "./odspRequest";

/**
 * @internal
 */
export interface IOdspTokens {
	readonly accessToken: string;
	readonly refreshToken: string;
}

/**
 * @internal
 */
export interface IClientConfig {
	clientId: string;
	clientSecret: string;
}

/**
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
	client_secret: string;
	scope: string;
};

/**
 * @alpha
 */
export const getOdspScope = (server: string) =>
	`offline_access ${getSiteUrl(server)}/AllSites.Write`;
/**
 * @alpha
 */
export const pushScope = "offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";

/**
 * @internal
 */
export function getFetchTokenUrl(server: string): string {
	return `${getAadUrl(server)}/${getAadTenant(server)}/oauth2/v2.0/token`;
}

/**
 * @internal
 */
export function getLoginPageUrl(
	server: string,
	clientConfig: IClientConfig,
	scope: string,
	odspAuthRedirectUri: string,
) {
	return (
		`${getAadUrl(server)}/${getAadTenant(server)}/oauth2/v2.0/authorize?` +
		`client_id=${clientConfig.clientId}` +
		`&scope=${scope}` +
		`&response_type=code` +
		`&redirect_uri=${odspAuthRedirectUri}`
	);
}

/**
 * @internal
 */
export const getOdspRefreshTokenFn = (
	server: string,
	clientConfig: IClientConfig,
	tokens: IOdspTokens,
) => getRefreshTokenFn(getOdspScope(server), server, clientConfig, tokens);
/**
 * @internal
 */
export const getPushRefreshTokenFn = (
	server: string,
	clientConfig: IClientConfig,
	tokens: IOdspTokens,
) => getRefreshTokenFn(pushScope, server, clientConfig, tokens);
/**
 * @internal
 */
export const getRefreshTokenFn =
	(scope: string, server: string, clientConfig: IClientConfig, tokens: IOdspTokens) =>
	async () => {
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
	clientConfig: IClientConfig,
	credentials: TokenRequestCredentials,
): Promise<IOdspTokens> {
	const body: TokenRequestBody = {
		scope,
		client_id: clientConfig.clientId,
		client_secret: clientConfig.clientSecret,
		...credentials,
	};
	const response = await unauthPostAsync(
		getFetchTokenUrl(server),
		new URLSearchParams(body), // This formats the body like a query string which is the expected format
	);

	const parsedResponse = await response.json();
	const accessToken = parsedResponse.access_token;
	const refreshToken = parsedResponse.refresh_token;

	if (accessToken === undefined || refreshToken === undefined) {
		try {
			throwOdspNetworkError(
				// pre-0.58 error message: unableToGetAccessToken
				"Unable to get access token.",
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

function isAccessTokenError(parsedResponse: any): parsedResponse is AadOauth2TokenError {
	return typeof parsedResponse?.error === "string" && Array.isArray(parsedResponse?.error_codes);
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
	clientConfig: IClientConfig,
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

/**
 * Issue the requestCallback, providing the proper auth header based on authRequestInfo,
 * and retrying with a refreshed token if necessary.
 * @internal
 */
export async function authRequestWithRetry(
	authRequestInfo: IOdspAuthRequestInfo,
	requestCallback: (config: RequestInit) => Promise<Response>,
): Promise<Response> {
	const createConfig = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

	const result = await requestCallback(createConfig(authRequestInfo.accessToken));

	if (authRequestInfo.refreshTokenFn && (result.status === 401 || result.status === 403)) {
		// Unauthorized, try to refresh the token
		const refreshedAccessToken = await authRequestInfo.refreshTokenFn();
		return requestCallback(createConfig(refreshedAccessToken));
	}
	return result;
}

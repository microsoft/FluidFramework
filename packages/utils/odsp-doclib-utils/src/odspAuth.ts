/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getAadTenant, getAadUrl, getSiteUrl } from "./odspDocLibUtils.js";

/**
 * @internal
 */
export interface IOdspTokens {
	readonly accessToken: string;
	readonly refreshToken?: string; // Refresh token is not used in federated credential flow, so it's optional.
	readonly receivedAt?: number; // Unix timestamp in seconds
	readonly expiresIn?: number; // Seconds from reception until the token expires
}

/**
 * Configuration for a public client.
 * @internal
 */
export interface IPublicClientConfig {
	clientId: string;
}

/**
 * @legacy @beta
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

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @legacy @beta
 */
export const getOdspScope = (server: string): string =>
	`offline_access ${getSiteUrl(server)}/AllSites.Write`;
/**
 * @legacy @beta
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

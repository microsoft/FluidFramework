/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RequestInit, Response } from "node-fetch";
import { getAadTenant } from "./odspDocLibUtils";
import { throwOdspNetworkError } from "./odspErrorUtils";
import { unauthPostAsync } from "./odspRequest";

export interface IOdspTokens {
    accessToken: string;
    refreshToken: string;
}

export interface IClientConfig {
    clientId: string;
    clientSecret: string;
}

export interface IOdspAuthRequestInfo {
    accessToken: string;
    refreshTokenFn?: () => Promise<string>,
}

export type TokenRequestCredentials = {
    grant_type: "authorization_code";
    code: string;
    redirect_uri: string;
} | {
    grant_type: "refresh_token";
    refresh_token: string;
} | {
    grant_type: "password";
    username: string;
    password: string;
};

type TokenRequestBody =
    TokenRequestCredentials & {
        client_id: string,
        client_secret: string,
        scope: string,
    };

export const getOdspScope = (server: string) => `offline_access https://${server}/AllSites.Write`;
export const pushScope = "offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";

export function getFetchTokenUrl(server: string): string {
    return `https://login.microsoftonline.com/${getAadTenant(server)}/oauth2/v2.0/token`;
}

export function getLoginPageUrl(
    server: string,
    clientConfig: IClientConfig,
    scope: string,
    odspAuthRedirectUri: string,
) {
    return `https://login.microsoftonline.com/${getAadTenant(server)}/oauth2/v2.0/authorize?`
        + `client_id=${clientConfig.clientId}`
        + `&scope=${scope}`
        + `&response_type=code`
        + `&redirect_uri=${odspAuthRedirectUri}`;
}

export const getOdspRefreshTokenFn = (server: string, clientConfig: IClientConfig, tokens: IOdspTokens) =>
    getRefreshTokenFn(getOdspScope(server), server, clientConfig, tokens);
export const getPushRefreshTokenFn = (server: string, clientConfig: IClientConfig, tokens: IOdspTokens) =>
    getRefreshTokenFn(pushScope, server, clientConfig, tokens);
export const getRefreshTokenFn = (scope: string, server: string, clientConfig: IClientConfig, tokens: IOdspTokens) =>
    async () => {
        await refreshTokens(server, scope, clientConfig, tokens);
        return tokens.accessToken;
    };

/**
 * Fetch an access token and refresh token from AAD
 * @param server - The server to auth against
 * @param scope - The desired oauth scope
 * @param clientConfig - Info about this client's identity
 * @param credentials - Credentials authorizing the client for the requested token
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
    const result = await unauthPostAsync(
        getFetchTokenUrl(server),
        new URLSearchParams(body), // This formats the body like a query string which is the expected format
    );
    const tokens = await result.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    if (accessToken === undefined || refreshToken === undefined) {
        throwOdspNetworkError("Unable to get access token.", tokens.error === "invalid_grant" ? 401 : result.status);
    }
    return { accessToken, refreshToken };
}

/**
 * Fetch fresh tokens and update the provided tokens object with them
 * @param server - The server to auth against
 * @param scope - The desired oauth scope
 * @param clientConfig - Info about this client's identity
 * @param tokens - The tokens object to update with fresh tokens. Also provides the refresh token for the request
 */
export async function refreshTokens(
    server: string,
    scope: string,
    clientConfig: IClientConfig,
    tokens: IOdspTokens,
): Promise<void> {
    // Clear out the old tokens while awaiting the new tokens
    const refresh_token = tokens.refreshToken;
    tokens.accessToken = "";
    tokens.refreshToken = "";

    const credentials: TokenRequestCredentials = {
        grant_type: "refresh_token",
        refresh_token,
    };
    const newTokens = await fetchTokens(server, scope, clientConfig, credentials);

    // Instead of returning, update the passed in tokens object
    tokens.accessToken = newTokens.accessToken;
    tokens.refreshToken = newTokens.refreshToken;
}

/**
 * Issue the requestCallback, providing the proper auth header based on authRequestInfo,
 * and retrying with a refreshed token if necessary.
 */
export async function authRequestWithRetry(
    authRequestInfo: IOdspAuthRequestInfo,
    requestCallback: (config: RequestInit) => Promise<Response>,
): Promise<Response> {
    const createConfig = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

    const result = await requestCallback(createConfig(authRequestInfo.accessToken));

    if (authRequestInfo.refreshTokenFn && (result.status === 401 || result.status === 403)) {
        // Unauthorized, try to refresh the token
        const refreshedAccessToken = await authRequestInfo.refreshTokenFn();
        return requestCallback(createConfig(refreshedAccessToken));
    }
    return result;
}

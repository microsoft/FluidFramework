
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios, { AxiosResponse, AxiosRequestConfig } from "axios";
import { getSharepointTenant } from "./odspUtils";

export interface IRequestResult {
    href: string | undefined;
    status: number;
    data: any;
}

export interface IOdspTokens {
    accessToken: string;
    refreshToken: string;
}

export interface IClientConfig {
    clientId: string;
    clientSecret: string;
}

export type RequestResultError = Error & { requestResult?: IRequestResult };

export const getOdspScope = (server: string) => `offline_access https://${server}/AllSites.Write`;
export const pushScope = "offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";

export const getOdspRefreshTokenFn = (server: string, clientConfig: IClientConfig, tokens: IOdspTokens) =>
    getRefreshTokenFn(getOdspScope(server), server, clientConfig, tokens);
export const getPushRefreshTokenFn = (server: string, clientConfig: IClientConfig, tokens: IOdspTokens) =>
    getRefreshTokenFn(pushScope, server, clientConfig, tokens);
export const getRefreshTokenFn = (scope: string, server: string, clientConfig: IClientConfig, tokens: IOdspTokens) =>
    async () => {
        await refreshAccessToken(scope, server, clientConfig, tokens);
        return tokens.accessToken;
    };

export interface IOdspAuthRequestInfo {
    accessToken: string;
    refreshTokenFn?: () => Promise<string>,
}

export async function getAsync(
    url: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IRequestResult> {
    return authRequest(authRequestInfo, async (config) => Axios.get(url, config));
}

export async function putAsync(
    url: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IRequestResult> {
    return authRequest(authRequestInfo, async (config) => Axios.put(url, undefined, config));
}

export async function postAsync(
    url: string,
    body: any,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IRequestResult> {
    return authRequest(authRequestInfo, async (config) => Axios.post(url, body, config));
}

export async function fetchTokens(
    server: string,
    clientConfig: IClientConfig,
    scope: string,
    authorizationCode: string,
    redirectUri: string,
): Promise<IOdspTokens> {
    const result = await unauthPostAsync(
        getFetchTokenUrl(server),
        getFetchTokenBody(clientConfig, scope, authorizationCode, redirectUri),
    );
    return getTokensFromResponse(result);
}

export async function refreshAccessToken(
    scope: string,
    server: string,
    clientConfig: IClientConfig,
    tokens: IOdspTokens,
): Promise<void> {
    tokens.accessToken = "";

    const result = await unauthPostAsync(
        getFetchTokenUrl(server),
        getRefreshTokenBody(scope, clientConfig, tokens.refreshToken),
    );
    const newTokens = getTokensFromResponse(result);

    tokens.accessToken = newTokens.accessToken;
    tokens.refreshToken = newTokens.refreshToken;
}

async function unauthPostAsync(url: string, body: any): Promise<IRequestResult> {
    return safeRequestCore(async () => Axios.post(url, body));
}

async function authRequest(
    authRequestInfo: IOdspAuthRequestInfo,
    requestCallback: (config: AxiosRequestConfig) => Promise<any>,
): Promise<IRequestResult> {
    const request = async (token: string) => {
        const config: AxiosRequestConfig = { headers: { Authorization: `Bearer ${token}` } };
        return safeRequestCore(async () => requestCallback(config));
    };

    const result = await request(authRequestInfo.accessToken);

    if (!authRequestInfo.refreshTokenFn || (result.status !== 401 && result.status !== 403)) {
        return result;
    }

    // Unauthorized, try to refresh the token
    const refreshedAccessToken = await authRequestInfo.refreshTokenFn();

    return request(refreshedAccessToken);
}

async function safeRequestCore(requestCallback: () => Promise<AxiosResponse>): Promise<IRequestResult> {
    let response: AxiosResponse;
    try {
        response = await requestCallback();
    } catch (error) {
        if (error?.response?.status) {
            response = error.response;
        } else {
            throw error;
        }
    }
    return { href: response.config.url, status: response.status, data: response.data };
}

function getFetchTokenUrl(server: string): string {
    return `https://login.microsoftonline.com/${getSharepointTenant(server)}/oauth2/v2.0/token`;
}

function getFetchTokenBody(
    clientConfig: IClientConfig,
    scope: string,
    authorizationCode: string,
    redirectUri: string,
): string {
    return `scope=${scope}`
        + `&client_id=${clientConfig.clientId}`
        + `&client_secret=${clientConfig.clientSecret}`
        + `&grant_type=authorization_code`
        + `&code=${authorizationCode}`
        + `&redirect_uri=${redirectUri}`;
}

function getRefreshTokenBody(scope: string, clientConfig: IClientConfig, refreshToken: string): string {
    return `scope=${scope}`
        + `&client_id=${clientConfig.clientId}`
        + `&client_secret=${clientConfig.clientSecret}`
        + `&grant_type=refresh_token`
        + `&refresh_token=${refreshToken}`;
}

function getTokensFromResponse(result: IRequestResult): IOdspTokens {
    const accessToken = result.data.access_token;
    const refreshToken = result.data.refresh_token;
    if (accessToken === undefined || refreshToken === undefined) {
        throw createErrorFromResponse("Unable to get access token.", result);
    }
    return { accessToken, refreshToken };
}

export function createErrorFromResponse(message: string, requestResult: IRequestResult): RequestResultError {
    const error: RequestResultError = Error(message);
    error.requestResult = requestResult;
    return error;
}

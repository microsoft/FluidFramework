
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios, { AxiosResponse, AxiosRequestConfig } from "axios";
import { getSharepointTenant } from "./odspUtils";

export interface IOdspAuthInfo {
    server: string;
    clientConfig: IClientConfig;
    tokens: IOdspTokens;
}

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

export async function getAsync(url: string, authInfo: IOdspAuthInfo, attemptRefresh = true): Promise<IRequestResult> {
    return authRequest(authInfo, async (config) => Axios.get(url, config), attemptRefresh);
}

export async function putAsync(url: string, authInfo: IOdspAuthInfo, attemptRefresh = true): Promise<IRequestResult> {
    return authRequest(authInfo, async (config) => Axios.put(url, undefined, config), attemptRefresh);
}

export async function postAsync(
    url: string,
    body: any,
    authInfo: IOdspAuthInfo,
    attemptRefresh = true,
): Promise<IRequestResult> {
    return authRequest(authInfo, async (config) => Axios.post(url, body, config), attemptRefresh);
}

async function unauthPostAsync(url: string, body: any): Promise<IRequestResult> {
    return safeRequestCore(async () => Axios.post(url, body));
}

async function authRequest(
    authInfo: IOdspAuthInfo,
    requestCallback: (config: AxiosRequestConfig) => Promise<any>,
    attemptRefresh,
): Promise<IRequestResult> {
    const request = async (token: string) => {
        const config: AxiosRequestConfig = { headers: { Authorization: `Bearer ${token}` } };
        return safeRequestCore(async () => requestCallback(config));
    };

    const result = await request(authInfo.tokens.accessToken);

    if (!attemptRefresh || (result.status !== 401 && result.status !== 403)) {
        return result;
    }

    // Unauthorized, try to refresh the token
    await refreshAccessToken(authInfo);

    return request(authInfo.tokens.accessToken);
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

export async function refreshAccessToken(authInfo: IOdspAuthInfo): Promise<void> {
    authInfo.tokens.accessToken = "";

    const result = await unauthPostAsync(
        getFetchTokenUrl(authInfo.server),
        getRefreshTokenBody(authInfo),
    );
    const newTokens = getTokensFromResponse(result);

    authInfo.tokens.accessToken = newTokens.accessToken;
    authInfo.tokens.refreshToken = newTokens.refreshToken;
}

export async function fetchOdspTokens(
    server: string,
    clientConfig: IClientConfig,
    authorizationCode: string,
    redirectUri: string,
): Promise<IOdspTokens> {
    const result = await unauthPostAsync(
        getFetchTokenUrl(server),
        getFetchTokenBody(server,clientConfig, authorizationCode, redirectUri),
    );
    return getTokensFromResponse(result);
}

function getFetchTokenUrl(server: string): string {
    return `https://login.microsoftonline.com/${getSharepointTenant(server)}/oauth2/v2.0/token`;
}

function getFetchTokenBody(
    server: string,
    clientConfig: IClientConfig,
    authorizationCode: string,
    redirectUri: string,
): string {
    return `scope=offline_access https://${server}/AllSites.Write`
        + `&client_id=${clientConfig.clientId}`
        + `&client_secret=${clientConfig.clientSecret}`
        + `&grant_type=authorization_code`
        + `&code=${authorizationCode}`
        + `&redirect_uri=${redirectUri}`;
}

function getRefreshTokenBody(authInfo: IOdspAuthInfo): string {
    return `scope=offline_access https://${authInfo.server}/AllSites.Write`
        + `&client_id=${authInfo.clientConfig.clientId}`
        + `&client_secret=${authInfo.clientConfig.clientSecret}`
        + `&grant_type=refresh_token`
        + `&refresh_token=${authInfo.tokens.refreshToken}`;
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

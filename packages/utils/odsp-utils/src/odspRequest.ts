/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios, { AxiosResponse, AxiosRequestConfig } from "axios";
import {
    IOdspAuthRequestInfo,
    authRequestWithRetry,
} from "./odspAuth";

export async function getAsync(
    url: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<AxiosResponse> {
    return authRequest(authRequestInfo, async (config) => Axios.get(url, config));
}

export async function putAsync(
    url: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<AxiosResponse> {
    return authRequest(authRequestInfo, async (config) => Axios.put(url, undefined, config));
}

export async function postAsync(
    url: string,
    body: any,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<AxiosResponse> {
    return authRequest(authRequestInfo, async (config) => Axios.post(url, body, config));
}

export async function unauthPostAsync(url: string, body: any): Promise<AxiosResponse> {
    return safeRequestCore(async () => Axios.post(url, body));
}

async function authRequest(
    authRequestInfo: IOdspAuthRequestInfo,
    requestCallback: (config: AxiosRequestConfig) => Promise<any>,
): Promise<AxiosResponse> {
    return authRequestWithRetry(
        authRequestInfo,
        async (config) => safeRequestCore(async () => requestCallback(config)),
    );
}

async function safeRequestCore(requestCallback: () => Promise<AxiosResponse>): Promise<AxiosResponse> {
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
    return response;
}

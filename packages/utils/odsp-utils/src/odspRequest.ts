/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios, { AxiosResponse, AxiosRequestConfig } from "axios";
import {
    IOdspAuthRequestInfo,
    authRequestWithRetry,
} from "./odspAuth";

export interface IRequestResult {
    href: string | undefined;
    status: number;
    data: any;
}

export type RequestResultError = Error & { requestResult?: IRequestResult };

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

export async function unauthPostAsync(url: string, body: any): Promise<IRequestResult> {
    return safeRequestCore(async () => Axios.post(url, body));
}

async function authRequest(
    authRequestInfo: IOdspAuthRequestInfo,
    requestCallback: (config: AxiosRequestConfig) => Promise<any>,
): Promise<IRequestResult> {
    return authRequestWithRetry(
        authRequestInfo,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        async (config) => safeRequestCore(async () => requestCallback(config)),
    );
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

export function createErrorFromResponse(message: string, requestResult: IRequestResult): RequestResultError {
    const error: RequestResultError = Error(message);
    error.requestResult = requestResult;
    return error;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { isStatusRetriable, throwR11sNetworkError } from "./r11sError";

export async function enhanceRequestError(error: any): Promise<never> {
    if (error?.isAxiosError) {
        const axiosError = error as AxiosError;
        throwR11sNetworkError(
            axiosError.response?.statusText
                ? `${axiosError.response?.data} (${axiosError.response?.statusText})`
                : axiosError.response?.data,
            axiosError.response?.status,
            isStatusRetriable(axiosError.response?.status, axiosError.response?.data?.retryAfter),
            axiosError.response?.data?.retryAfter
                ? axiosError.response?.data?.retryAfter
                : undefined,
        );
    }
    throwR11sNetworkError(`${error}`);
}

/**
 * Make an authorized request to a service.
 */
export async function authorizedRequest<T = any, R = AxiosResponse<T>>(
    requestConfig: AxiosRequestConfig,
    getAuthHeader: () => Promise<string>,
): Promise<R> {
    const authorizationHeader = await getAuthHeader();
    return Axios.request<T, R>({
        ...requestConfig,
        headers: {
            ...requestConfig.headers,
            Authorization: authorizationHeader,
        },
    });
}

/**
 * Make an authorized request to a service.
 * Retries once with refreshed token if request fails as unauthorized.
 */
export const authorizedRequestWithRetry = async <T = any, R = AxiosResponse<T>>(
    requestConfig: AxiosRequestConfig,
    getAuthHeader: () => Promise<string>,
): Promise<R> =>
    authorizedRequest<T, R>(requestConfig, getAuthHeader)
        .catch(async (error) => {
            if (error?.response?.status === 401) {
                return authorizedRequest<T, R>(requestConfig, getAuthHeader)
                    .catch(enhanceRequestError);
            }
            return enhanceRequestError(error);
        });

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as querystring from "querystring";
import safeStringify from "json-stringify-safe";
import Axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import { v4 as uuid } from "uuid";
import { debug } from "./debug";
import { createFluidServiceNetworkError, INetworkErrorDetails } from "./error";
import { CorrelationIdHeaderName } from "./constants";

export abstract class RestWrapper {
    constructor(
        protected readonly baseurl?: string,
        protected defaultQueryString: Record<string, unknown> = {},
        protected readonly maxBodyLength = 1000 * 1024 * 1024,
        protected readonly maxContentLength = 1000 * 1024 * 1024,
    ) {
    }

    public async get<T>(
        url: string,
        queryString?: Record<string, unknown>,
        headers?: AxiosRequestHeaders,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            headers,
            maxBodyLength: this.maxBodyLength,
            maxContentLength: this.maxContentLength,
            method: "GET",
            url: `${url}${this.generateQueryString(queryString)}`,
        };
        return this.request<T>(options, 200);
    }

    public async post<T>(
        url: string,
        requestBody: any,
        queryString?: Record<string, unknown>,
        headers?: AxiosRequestHeaders,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            data: requestBody,
            headers,
            maxBodyLength: this.maxBodyLength,
            maxContentLength: this.maxContentLength,
            method: "POST",
            url: `${url}${this.generateQueryString(queryString)}`,
        };
        return this.request<T>(options, 201);
    }

    public async delete<T>(
        url: string,
        queryString?: Record<string, unknown>,
        headers?: AxiosRequestHeaders,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            headers,
            maxBodyLength: this.maxBodyLength,
            maxContentLength: this.maxContentLength,
            method: "DELETE",
            url: `${url}${this.generateQueryString(queryString)}`,
        };
        return this.request<T>(options, 204);
    }

    public async patch<T>(
        url: string,
        requestBody: any,
        queryString?: Record<string, unknown>,
        headers?: AxiosRequestHeaders,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            data: requestBody,
            headers,
            maxBodyLength: this.maxBodyLength,
            maxContentLength: this.maxContentLength,
            method: "PATCH",
            url: `${url}${this.generateQueryString(queryString)}`,
        };
        return this.request<T>(options, 200);
    }

    protected abstract request<T>(options: AxiosRequestConfig, statusCode: number): Promise<T>;

    protected generateQueryString(queryStringValues: Record<string, unknown>) {
        if (this.defaultQueryString || queryStringValues) {
            const queryStringMap = { ...this.defaultQueryString, ...queryStringValues };

            const queryString = querystring.stringify(queryStringMap);
            if (queryString !== "") {
                return `?${queryString}`;
            }
        }

        return "";
    }
}

export class BasicRestWrapper extends RestWrapper {
    constructor(
        baseurl?: string,
        defaultQueryString: Record<string, unknown> = {},
        maxBodyLength = 1000 * 1024 * 1024,
        maxContentLength = 1000 * 1024 * 1024,
        private defaultHeaders: AxiosRequestHeaders = {},
        private readonly axios: AxiosInstance = Axios,
        private readonly refreshDefaultQueryString?: () => Record<string, unknown>,
        private readonly refreshDefaultHeaders?: () => AxiosRequestHeaders,
        private readonly getCorrelationId?: () => string | undefined,
    ) {
        super(baseurl, defaultQueryString, maxBodyLength, maxContentLength);
    }

    protected async request<T>(requestConfig: AxiosRequestConfig, statusCode: number, canRetry = true): Promise<T> {
        const options = { ...requestConfig };
        options.headers = this.generateHeaders(
            options.headers,
            this.getCorrelationId?.() ?? uuid(),
        );

        return new Promise<T>((resolve, reject) => {
            this.axios.request<T>(options)
                .then((response) => { resolve(response.data); })
                .catch((error: AxiosError) => {
                    if (error?.response?.status === statusCode) {
                        // Axios misinterpreted as error, return as successful response
                        resolve(error?.response?.data);
                    }

                    if (error?.config) {
                        debug(`[${error.config.method}] request to [${error.config.baseURL ?? ""}${error.config.url ?? ""}] failed with [${error.response?.status}] [${safeStringify(error.response?.data, undefined, 2)}]`);
                    } else {
                        debug(`request to ${options.url} failed ${error ? error.message : ""}`);
                    }

                    if (error?.response?.status === 429 && error?.response?.data?.retryAfter > 0 && canRetry) {
                        setTimeout(() => {
                            this.request<T>(options, statusCode)
                                .then(resolve)
                                .catch(reject);
                        }, error.response.data.retryAfter * 1000);
                    } else if (error?.response?.status === 401 && canRetry && this.refreshOnAuthError()) {
                        const retryConfig = { ...requestConfig };
                        retryConfig.headers = this.generateHeaders(
                            retryConfig.headers, options.headers[CorrelationIdHeaderName] as string);

                        this.request<T>(retryConfig, statusCode, false)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        // From https://axios-http.com/docs/handling_errors
                        if (error?.response) {
                            // The request was made and the server responded with a status code
                            // that falls out of the range of 2xx
                            reject(createFluidServiceNetworkError(error?.response?.status, error?.response?.data));
                        } else if (error?.request) {
                            // The request was made but no response was received. That can happen if a service is
                            // temporarily down or inaccessible due to network failures. We leverage that in here
                            // to detect network failures and transform them into a NetworkError with code 502,
                            // which can be retried and is not fatal.
                            reject(createFluidServiceNetworkError(
                                502, `Network Error: ${error?.message ?? "undefined"}`));
                        } else {
                            // Something happened in setting up the request that triggered an Error
                            const details: INetworkErrorDetails = {
                                canRetry: false,
                                isFatal: false,
                                message: error?.message ?? "Unknown Error",
                            };
                            reject(createFluidServiceNetworkError(500, details));
                        }
                    }
                });
        });
    }

    private generateHeaders(
        headers?: AxiosRequestHeaders,
        fallbackCorrelationId?: string,
    ): AxiosRequestHeaders {
        let result = headers ?? {};
        if (this.defaultHeaders) {
            result = { ...this.defaultHeaders, ...headers };
        }

        if (result[CorrelationIdHeaderName]) {
            return result;
        }
        return { [CorrelationIdHeaderName]: fallbackCorrelationId, ...result };
    }

    private refreshOnAuthError(): boolean {
        if (this.refreshDefaultQueryString === undefined && this.refreshDefaultHeaders === undefined) {
            // retry will not succeed with the same params and headers
            return false;
        }

        if (this.refreshDefaultHeaders !== undefined) {
            this.defaultHeaders = this.refreshDefaultHeaders();
        }
        if (this.refreshDefaultQueryString !== undefined) {
            this.defaultQueryString = this.refreshDefaultQueryString();
        }
        return true;
    }
}

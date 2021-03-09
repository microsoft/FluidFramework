/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as querystring from "querystring";
import { AxiosError, AxiosInstance, AxiosRequestConfig, default as Axios } from "axios";
import { v4 as uuid } from "uuid";
import { debug } from "./debug";

export abstract class RestWrapper {
    constructor(
        protected readonly baseurl?: string,
        protected defaultQueryString: Record<string, unknown> = {},
        protected readonly maxContentLength = 1000 * 1024 * 1024,
    ) {
    }

    public async get<T>(
        url: string,
        queryString?: Record<string, unknown>,
        headers?: Record<string, unknown>,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            headers,
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
        headers?: Record<string, unknown>,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            data: requestBody,
            headers,
            maxContentLength: this.maxContentLength,
            method: "POST",
            url: `${url}${this.generateQueryString(queryString)}`,
        };
        return this.request<T>(options, 201);
    }

    public async delete<T>(
        url: string,
        queryString?: Record<string, unknown>,
        headers?: Record<string, unknown>,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            headers,
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
        headers?: Record<string, unknown>,
    ): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            data: requestBody,
            headers,
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
        maxContentLength = 1000 * 1024 * 1024,
        private defaultHeaders: Record<string, unknown> = {},
        private readonly axios: AxiosInstance = Axios,
        private readonly refreshDefaultQueryString?: () => Record<string, unknown>,
        private readonly refreshDefaultHeaders?: () => Record<string, unknown>,
        private readonly getCorrelationId?: () => string | undefined,
    ) {
        super(baseurl, defaultQueryString, maxContentLength);
    }

    protected async request<T>(requestConfig: AxiosRequestConfig, statusCode: number, canRetry = true): Promise<T> {
        const options = { ...requestConfig };
        options.headers = this.generateHeaders(
            options.headers,
            (this.getCorrelationId && this.getCorrelationId()) || uuid());

        return new Promise<T>((resolve, reject) => {
            this.axios.request<T>(options)
                .then((response) => { resolve(response.data); })
                .catch((error: AxiosError) => {
                    if (error && error.config) {
                        // eslint-disable-next-line max-len
                        debug(`[${error.config.method}] request to [${error.config.url}] failed with [${error.code}] [${error.message}]`);
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
                            retryConfig.headers, options.headers["x-correlation-id"]);

                        this.request<T>(retryConfig, statusCode, false)
                            .then(resolve)
                            .catch(reject);
                    } else if (error.response && error.response.status !== statusCode) {
                        reject(error.response.status);
                    } else {
                        reject(error);
                    }
                });
        });
    }

    private generateHeaders(
        headers?: Record<string, unknown>,
        fallbackCorrelationId?: string,
    ): Record<string, unknown> {
        let result = headers ?? {};
        if (this.defaultHeaders) {
            result = { ...this.defaultHeaders, ...headers };
        }

        if (result["x-correlation-id"]) {
            return result;
        }
        return { "x-correlation-id": fallbackCorrelationId, ...result };
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

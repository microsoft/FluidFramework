/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as querystring from "querystring";
import { AxiosError, AxiosInstance, AxiosRequestConfig, default as Axios } from "axios";
import { v4 as uuid } from "uuid";
import { debug } from "./debug";

export abstract class RestWrapper {
    constructor(
        protected readonly baseurl?: string,
        protected defaultQueryString: querystring.ParsedUrlQueryInput = {},
        protected readonly maxBodyLength = 1000 * 1024 * 1024,
        protected readonly maxContentLength = 1000 * 1024 * 1024,
    ) {
    }

    public async get<T>(
        url: string,
        queryString?: querystring.ParsedUrlQueryInput,
        headers?: querystring.ParsedUrlQueryInput,
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
        queryString?: querystring.ParsedUrlQueryInput,
        headers?: querystring.ParsedUrlQueryInput,
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
        queryString?: querystring.ParsedUrlQueryInput,
        headers?: querystring.ParsedUrlQueryInput,
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
        queryString?: querystring.ParsedUrlQueryInput,
        headers?: querystring.ParsedUrlQueryInput,
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

    protected generateQueryString(queryStringValues: querystring.ParsedUrlQueryInput) {
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
        defaultQueryString: querystring.ParsedUrlQueryInput = {},
        maxBodyLength = 1000 * 1024 * 1024,
        maxContentLength = 1000 * 1024 * 1024,
        private defaultHeaders: querystring.ParsedUrlQueryInput = {},
        private readonly axios: AxiosInstance = Axios,
        private readonly refreshDefaultQueryString?: () => querystring.ParsedUrlQueryInput,
        private readonly refreshDefaultHeaders?: () => querystring.ParsedUrlQueryInput,
        private readonly getCorrelationId?: () => string | undefined,
    ) {
        super(baseurl, defaultQueryString, maxBodyLength, maxContentLength);
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
        headers?: querystring.ParsedUrlQueryInput,
        fallbackCorrelationId?: string,
    ): querystring.ParsedUrlQueryInput {
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

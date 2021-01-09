/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as querystring from "querystring";
import { AxiosError, AxiosInstance, AxiosRequestConfig, default as Axios } from "axios";
import * as uuid from "uuid";
import { debug } from "./debug";

export class RestWrapper {
    constructor(
        private readonly baseurl?: string,
        // eslint-disable-next-line @typescript-eslint/ban-types
        private readonly defaultHeaders?: {},
        // eslint-disable-next-line @typescript-eslint/ban-types
        private readonly defaultQueryString?: {},
        private readonly cacheBust = false,
        private readonly maxContentLength = 1000 * 1024 * 1024,
        private readonly axios: AxiosInstance = Axios) {
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async get<T>(url: string, queryString?: {}, headers?: {}): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            headers,
            maxContentLength: this.maxContentLength,
            method: "GET",
            url: `${url}${this.generateQueryString(queryString)}`,
        };
        return this.request<T>(options, 200);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async post<T>(url: string, requestBody: any, queryString?: {}, headers?: {}): Promise<T> {
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

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async delete<T>(url: string, queryString?: {}, headers?: {}): Promise<T> {
        const options: AxiosRequestConfig = {
            baseURL: this.baseurl,
            headers,
            maxContentLength: this.maxContentLength,
            method: "DELETE",
            url: `${url}${this.generateQueryString(queryString)}`,
        };
        return this.request<T>(options, 204);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async patch<T>(url: string, requestBody: any, queryString?: {}, headers?: {}): Promise<T> {
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

    private async request<T>(options: AxiosRequestConfig, statusCode: number): Promise<T> {
        if (this.defaultHeaders) {
            options.headers = { ...this.defaultHeaders, ...options.headers };
        }
        if (!options.headers?.["x-correlation-id"]) {
            options.headers = { ...{ "x-correlation-id": uuid.v4() }, ...options.headers };
        }

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

                    if (error?.response?.status === 429 && error?.response?.data?.retryAfter > 0) {
                        setTimeout(async () => {
                            this.request<T>(options, statusCode)
                                .then(resolve)
                                .catch(reject);
                        });
                        return;
                    } else if (error.response && error.response.status !== statusCode) {
                        reject(error.response.status);
                    } else {
                        reject(error);
                    }
                });
        });
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    private generateQueryString(queryStringValues: {}) {
        if (this.defaultQueryString || queryStringValues) {
            const queryStringMap = this.cacheBust
                ? { ...this.defaultQueryString, ...queryStringValues, ...{ cacheBust: Date.now() } }
                : { ...this.defaultQueryString, ...queryStringValues };

            const queryString = querystring.stringify(queryStringMap);
            if (queryString !== "") {
                return `?${queryString}`;
            }
        }

        return "";
    }
}

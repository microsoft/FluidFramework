/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AxiosError, AxiosInstance, AxiosRequestConfig, default as Axios } from "axios";
import * as querystring from "querystring";
import { debug } from "./debug";

export class RestWrapper {
    constructor(
        private baseurl?: string,
        private defaultHeaders?: {},
        private defaultQueryString?: {},
        private cacheBust = false,
        private maxContentLength = 1000 * 1024 * 1024,
        private axios: AxiosInstance = Axios) {
    }

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

        const response = await this.axios.request<T>(options)
            .catch(async (error: AxiosError) => {
                if (error && error.config) {
                    // tslint:disable-next-line:max-line-length
                    debug(`[${error.config.method}] request to [${error.config.url}] failed with [${error.code}] [${error.message}]`);
                } else {
                    debug(`request to ${options.url} failed ${error ? error.message : ""}`);
                }

                return error.response && error.response.status !== statusCode
                    ? Promise.reject(error.response.status)
                    : Promise.reject(error);
            });
        return response.data;
    }

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

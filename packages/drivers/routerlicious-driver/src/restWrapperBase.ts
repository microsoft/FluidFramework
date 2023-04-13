/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AxiosRequestConfig, AxiosRequestHeaders } from "axios";

export abstract class RestWrapper {
	constructor(
		protected readonly baseurl?: string,
		protected defaultQueryString: QueryStringType = {},
		protected readonly maxBodyLength = 1000 * 1024 * 1024,
		protected readonly maxContentLength = 1000 * 1024 * 1024,
	) {}

	public async get<T>(
		url: string,
		queryString?: QueryStringType,
		headers?: AxiosRequestHeaders,
		addNetworkCallProps?: boolean,
	): Promise<T> {
		const options: AxiosRequestConfig = {
			baseURL: this.baseurl,
			headers,
			maxBodyLength: this.maxBodyLength,
			maxContentLength: this.maxContentLength,
			method: "GET",
			url: `${url}${this.generateQueryString(queryString)}`,
		};
		return this.request<T>(options, 200, addNetworkCallProps);
	}

	public async post<T>(
		url: string,
		requestBody: any,
		queryString?: QueryStringType,
		headers?: AxiosRequestHeaders,
		addNetworkCallProps?: boolean,
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
		return this.request<T>(options, 201, addNetworkCallProps);
	}

	public async delete<T>(
		url: string,
		queryString?: QueryStringType,
		headers?: AxiosRequestHeaders,
		addNetworkCallProps?: boolean,
	): Promise<T> {
		const options: AxiosRequestConfig = {
			baseURL: this.baseurl,
			headers,
			maxBodyLength: this.maxBodyLength,
			maxContentLength: this.maxContentLength,
			method: "DELETE",
			url: `${url}${this.generateQueryString(queryString)}`,
		};
		return this.request<T>(options, 204, addNetworkCallProps);
	}

	public async patch<T>(
		url: string,
		requestBody: any,
		queryString?: QueryStringType,
		headers?: AxiosRequestHeaders,
		addNetworkCallProps?: boolean,
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
		return this.request<T>(options, 200, addNetworkCallProps);
	}

	protected abstract request<T>(
		options: AxiosRequestConfig,
		statusCode: number,
		addNetworkCallProps?: boolean,
	): Promise<T>;

	protected generateQueryString(queryStringValues?: QueryStringType) {
		if (this.defaultQueryString || queryStringValues) {
			const queryStringMap = { ...this.defaultQueryString, ...queryStringValues };

			return getQueryString(queryStringMap);
		}

		return "";
	}
}

/**
 * Generates query string from the given query parameters.
 * @param queryParams - Query parameters from which to create a query.
 */
export function getQueryString(queryParams: QueryStringType): string {
	let queryString = "";
	for (const key of Object.keys(queryParams)) {
		if (queryParams[key] !== undefined) {
			const startChar = queryString === "" ? "?" : "&";
			queryString += `${startChar}${key}=${encodeURIComponent(queryParams[key])}`;
		}
	}

	return queryString;
}

export type QueryStringType = Record<string, string | number | boolean>;

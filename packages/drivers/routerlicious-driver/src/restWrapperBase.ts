/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AxiosRequestConfig, AxiosRequestHeaders } from "./axios.cjs";
import { type QueryStringType } from "./queryStringUtils.js";
import { IR11sResponse } from "./restWrapper.js";

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
		additionalOptions?: Partial<
			Omit<
				AxiosRequestConfig,
				"baseURL" | "headers" | "maxBodyLength" | "maxContentLength" | "method" | "url"
			>
		>,
	): Promise<IR11sResponse<T>> {
		const options: AxiosRequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			headers,
			maxBodyLength: this.maxBodyLength,
			maxContentLength: this.maxContentLength,
			method: "GET",
			url,
			params: { ...this.defaultQueryString, ...queryString },
		};
		return this.request<T>(options, 200);
	}

	public async post<T>(
		url: string,
		requestBody: any,
		queryString?: QueryStringType,
		headers?: AxiosRequestHeaders,
		additionalOptions?: Partial<
			Omit<
				AxiosRequestConfig,
				"baseURL" | "headers" | "maxBodyLength" | "maxContentLength" | "method" | "url"
			>
		>,
	): Promise<IR11sResponse<T>> {
		const options: AxiosRequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			data: requestBody,
			headers,
			maxBodyLength: this.maxBodyLength,
			maxContentLength: this.maxContentLength,
			method: "POST",
			url,
			params: { ...this.defaultQueryString, ...queryString },
		};
		return this.request<T>(options, 201);
	}

	public async delete<T>(
		url: string,
		queryString?: QueryStringType,
		headers?: AxiosRequestHeaders,
		additionalOptions?: Partial<
			Omit<
				AxiosRequestConfig,
				"baseURL" | "headers" | "maxBodyLength" | "maxContentLength" | "method" | "url"
			>
		>,
	): Promise<IR11sResponse<T>> {
		const options: AxiosRequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			headers,
			maxBodyLength: this.maxBodyLength,
			maxContentLength: this.maxContentLength,
			method: "DELETE",
			url,
			params: { ...this.defaultQueryString, ...queryString },
		};
		return this.request<T>(options, 204);
	}

	public async patch<T>(
		url: string,
		requestBody: any,
		queryString?: QueryStringType,
		headers?: AxiosRequestHeaders,
		additionalOptions?: Partial<
			Omit<
				AxiosRequestConfig,
				"baseURL" | "headers" | "maxBodyLength" | "maxContentLength" | "method" | "url"
			>
		>,
	): Promise<IR11sResponse<T>> {
		const options: AxiosRequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			data: requestBody,
			headers,
			maxBodyLength: this.maxBodyLength,
			maxContentLength: this.maxContentLength,
			method: "PATCH",
			url,
			params: { ...this.defaultQueryString, ...queryString },
		};
		return this.request<T>(options, 200);
	}

	protected abstract request<T>(
		options: AxiosRequestConfig,
		statusCode: number,
		addNetworkCallProps?: boolean,
	): Promise<IR11sResponse<T>>;
}

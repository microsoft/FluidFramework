/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Raw request headers as a record of string keys to string, number, or boolean values.
 * Replaces axios's `RawAxiosRequestHeaders`.
 * @internal
 */
export type RawRequestHeaders = Record<string, string | number | boolean>;

/**
 * Configuration for an HTTP request.
 * Replaces axios's `AxiosRequestConfig`.
 * @internal
 */
export interface RequestConfig {
	baseURL?: string;
	url?: string;
	method?: string;
	headers?: RawRequestHeaders;
	data?: any;
	timeout?: number;
	timeoutErrorMessage?: string;
	signal?: AbortSignal;
}

/**
 * A function with the same signature as the global `fetch` function.
 * Replaces axios's `AxiosInstance`.
 * @internal
 */
export type FetchFn = (
	url: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

/**
 * Metric properties for HTTP requests made through the RestWrapper.
 * @internal
 */
export interface IRestWrapperMetricProps {
	requestError: Error | undefined;
	status: number | string;
	method: string;
	baseUrl: string;
	url: string;
	correlationId: string;
	durationInMs: number;
	timeoutInMs: number | string;
}

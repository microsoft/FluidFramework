/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import safeStringify from "json-stringify-safe";
import { v4 as uuid } from "uuid";

import {
	CallingServiceHeaderName,
	CorrelationIdHeaderName,
	TelemetryContextHeaderName,
} from "./constants";
import { debug } from "./debug";
import { createFluidServiceNetworkError, type INetworkErrorDetails } from "./error";
import { getGlobalFetchFn } from "./fetchContext";
import {
	buildFetchUrl,
	fetchWithTimeout,
	parseFetchResponse,
	toHeadersInit,
} from "./fetchHelpers";
import type {
	FetchFn,
	IRestWrapperMetricProps,
	RawRequestHeaders,
	RequestConfig,
} from "./fetchTypes";
import { getGlobalTimeoutContext } from "./timeoutContext";

/**
 * @internal
 */
export abstract class RestWrapper {
	constructor(
		protected readonly baseurl?: string,
		protected defaultQueryString: Record<string, string | number | boolean> = {},
		protected readonly maxBodyLength = 1000 * 1024 * 1024,
		protected readonly maxContentLength = 1000 * 1024 * 1024,
	) {}

	private getTimeoutMs(): number | undefined {
		const timeout = getGlobalTimeoutContext().getTimeRemainingMs();
		if (timeout && timeout > 0) {
			return timeout;
		}
		return undefined;
	}

	private getTimeoutMessage(url: string): string {
		return `Timeout occurred for request to ${url}`;
	}

	public async get<T>(
		url: string,
		queryString?: Record<string, string | number | boolean>,
		headers?: RawRequestHeaders,
		additionalOptions?: Partial<
			Omit<RequestConfig, "baseURL" | "headers" | "method" | "url">
		>,
	): Promise<T> {
		const options: RequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			headers,
			method: "GET",
			url: `${url}${this.generateQueryString(queryString)}`,
			timeout: this.getTimeoutMs(),
			timeoutErrorMessage: this.getTimeoutMessage(url),
		};
		return this.request<T>(options, 200);
	}

	public async post<T>(
		url: string,
		requestBody: any,
		queryString?: Record<string, string | number | boolean>,
		headers?: RawRequestHeaders,
		additionalOptions?: Partial<
			Omit<RequestConfig, "baseURL" | "headers" | "method" | "url">
		>,
	): Promise<T> {
		const options: RequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			data: requestBody,
			headers,
			method: "POST",
			url: `${url}${this.generateQueryString(queryString)}`,
			timeout: this.getTimeoutMs(),
			timeoutErrorMessage: this.getTimeoutMessage(url),
		};
		return this.request<T>(options, 201);
	}

	public async delete<T>(
		url: string,
		queryString?: Record<string, string | number | boolean>,
		headers?: RawRequestHeaders,
		additionalOptions?: Partial<
			Omit<RequestConfig, "baseURL" | "headers" | "method" | "url">
		>,
	): Promise<T> {
		const options: RequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			headers,
			method: "DELETE",
			url: `${url}${this.generateQueryString(queryString)}`,
			timeout: this.getTimeoutMs(),
			timeoutErrorMessage: this.getTimeoutMessage(url),
		};
		return this.request<T>(options, 204);
	}

	public async patch<T>(
		url: string,
		requestBody: any,
		queryString?: Record<string, string | number | boolean>,
		headers?: RawRequestHeaders,
		additionalOptions?: Partial<
			Omit<RequestConfig, "baseURL" | "headers" | "method" | "url">
		>,
	): Promise<T> {
		const options: RequestConfig = {
			...additionalOptions,
			baseURL: this.baseurl,
			data: requestBody,
			headers,
			method: "PATCH",
			url: `${url}${this.generateQueryString(queryString)}`,
			timeout: this.getTimeoutMs(),
			timeoutErrorMessage: this.getTimeoutMessage(url),
		};
		return this.request<T>(options, 200);
	}

	protected abstract request<T>(options: RequestConfig, statusCode: number): Promise<T>;

	protected generateQueryString(
		queryStringValues: Record<string, string | number | boolean> | undefined,
	) {
		if (this.defaultQueryString || queryStringValues) {
			const queryStringRecord = { ...this.defaultQueryString, ...queryStringValues };

			const stringifiedQueryStringRecord: Record<string, string> = {};
			for (const key of Object.keys(queryStringRecord)) {
				stringifiedQueryStringRecord[key] = queryStringRecord[key].toString();
			}

			const urlSearchParams = new URLSearchParams(stringifiedQueryStringRecord);
			const queryString = urlSearchParams.toString();
			if (queryString !== "") {
				return `?${queryString}`;
			}
		}

		return "";
	}
}

/**
 * @internal
 */
export class BasicRestWrapper extends RestWrapper {
	constructor(
		baseurl?: string,
		defaultQueryString: Record<string, string | number | boolean> = {},
		maxBodyLength = 1000 * 1024 * 1024,
		maxContentLength = 1000 * 1024 * 1024,
		private defaultHeaders: RawRequestHeaders = {},
		private readonly fetchFn: FetchFn = getGlobalFetchFn(),
		private readonly refreshDefaultQueryString?: () => Record<
			string,
			string | number | boolean
		>,
		private readonly refreshDefaultHeaders?: () => RawRequestHeaders,
		private readonly getCorrelationId?: () => string | undefined,
		private readonly getTelemetryContextProperties?: () =>
			| Record<string, string | number | boolean>
			| undefined,
		private readonly refreshTokenIfNeeded?: (
			authorizationHeader: RawRequestHeaders,
		) => Promise<RawRequestHeaders | undefined>,
		private readonly logHttpMetrics?: (requestProps: IRestWrapperMetricProps) => void,
		private readonly getCallingServiceName?: () => string | undefined,
	) {
		super(baseurl, defaultQueryString, maxBodyLength, maxContentLength);
	}

	protected async request<T>(
		requestConfig: RequestConfig,
		statusCode: number,
		canRetry = true,
	): Promise<T> {
		const options = { ...requestConfig };
		const correlationId = this.getCorrelationId?.() ?? uuid();
		const callingServiceName = this.getCallingServiceName?.();
		options.headers = this.generateHeaders(
			options.headers,
			correlationId,
			this.getTelemetryContextProperties?.(),
			callingServiceName,
		);

		// If the request has an Authorization header and a refresh token function is provided, try to refresh the token if needed
		if (options.headers?.Authorization && this.refreshTokenIfNeeded) {
			const refreshedToken = await this.refreshTokenIfNeeded(options.headers).catch(
				(error) => {
					debug(`request to ${options.url} failed ${error ? error.message : ""}`);
					throw error;
				},
			);
			if (refreshedToken) {
				options.headers.Authorization = refreshedToken.Authorization;
				// Update the default headers to use the refreshed token
				this.defaultHeaders.Authorization = refreshedToken.Authorization;
			}
		}

		const fullUrl = buildFetchUrl(options.baseURL, options.url);
		const method = (options.method ?? "GET").toUpperCase();
		const fetchHeaders = toHeadersInit(options.headers ?? {});

		if (options.data !== undefined && method !== "GET" && method !== "HEAD") {
			fetchHeaders["Content-Type"] = fetchHeaders["Content-Type"] ?? "application/json";
		}

		const init: RequestInit = {
			method,
			headers: fetchHeaders,
			body:
				options.data !== undefined && method !== "GET" && method !== "HEAD"
					? typeof options.data === "string"
						? options.data
						: JSON.stringify(options.data)
					: undefined,
		};

		const startTime = performance.now();
		let requestError: Error | undefined;
		let responseStatus: number | string = "STATUS_UNAVAILABLE";

		try {
			const response = await fetchWithTimeout(
				this.fetchFn,
				fullUrl,
				init,
				options.timeout,
				options.timeoutErrorMessage,
			);

			responseStatus = response.status;

			if (response.ok || response.status === statusCode) {
				return await parseFetchResponse<T>(response);
			}

			// Non-ok response: parse error body
			let errorData: any;
			try {
				errorData = await parseFetchResponse<any>(response);
			} catch {
				errorData = {};
			}

			debug(
				`[${method}] request to [${fullUrl}] failed with [${response.status}] [${safeStringify(
					errorData,
					undefined,
					2,
				)}]`,
			);

			if (
				response.status === 429 &&
				errorData?.retryAfter > 0 &&
				canRetry
			) {
				return new Promise<T>((resolve, reject) => {
					setTimeout(() => {
						this.request<T>(options, statusCode).then(resolve).catch(reject);
					}, errorData.retryAfter * 1000);
				});
			} else if (
				response.status === 401 &&
				canRetry &&
				this.refreshOnAuthError()
			) {
				const retryConfig = { ...requestConfig };
				retryConfig.headers = this.generateHeaders(
					retryConfig.headers,
					options.headers?.[CorrelationIdHeaderName] as string | undefined,
				);

				return this.request<T>(retryConfig, statusCode, false);
			}

			const errorSourceMessage = `[${method}] request to [${fullUrl}] failed with [${response.status}] status code`;
			if (typeof errorData === "string") {
				throw createFluidServiceNetworkError(response.status, {
					message: errorData,
					source: errorSourceMessage,
				});
			} else {
				throw createFluidServiceNetworkError(response.status, {
					...errorData,
					source: errorSourceMessage,
				});
			}
		} catch (error: unknown) {
			if (error instanceof Error && error.name === "NetworkError") {
				// Already a NetworkError from the block above, rethrow
				requestError = error;
				throw error;
			}

			const errorSourceMessage = `[${method}] request to [${fullUrl}] failed`;

			if (error instanceof DOMException && error.name === "AbortError") {
				responseStatus = 499;
				const networkError = createFluidServiceNetworkError(499, {
					message: error.message ?? "Request Aborted by Client",
					source: errorSourceMessage,
				});
				requestError = networkError;
				throw networkError;
			} else if (error instanceof TypeError) {
				// TypeError is thrown by fetch for network errors (e.g., DNS failure, connection refused)
				responseStatus = 502;
				const networkError = createFluidServiceNetworkError(502, {
					message: `Network Error: ${error.message ?? "undefined"}`,
					source: errorSourceMessage,
				});
				requestError = networkError;
				throw networkError;
			} else {
				responseStatus = 500;
				const details: INetworkErrorDetails = {
					canRetry: false,
					isFatal: false,
					message: error instanceof Error ? error.message : "Unknown Error",
					source: errorSourceMessage,
				};
				const networkError = createFluidServiceNetworkError(500, details);
				requestError = networkError;
				throw networkError;
			}
		} finally {
			if (this.logHttpMetrics) {
				const requestProps: IRestWrapperMetricProps = {
					requestError,
					status: responseStatus,
					baseUrl: options.baseURL ?? "BASE_URL_UNAVAILABLE",
					method: options.method ?? "METHOD_UNAVAILABLE",
					url: options.url ?? "URL_UNAVAILABLE",
					correlationId,
					durationInMs: performance.now() - startTime,
					timeoutInMs: options.timeout ?? "TIMEOUT_UNAVAILABLE",
				};
				this.logHttpMetrics(requestProps);
			}
		}
	}

	private generateHeaders(
		headers?: RawRequestHeaders,
		fallbackCorrelationId?: string,
		telemetryContextProperties?: Record<string, string | number | boolean>,
		callingServiceName?: string,
	): RawRequestHeaders {
		const result = {
			...this.defaultHeaders,
			...headers,
		};

		if (!result[CorrelationIdHeaderName] && fallbackCorrelationId) {
			result[CorrelationIdHeaderName] = fallbackCorrelationId;
		}
		if (!result[TelemetryContextHeaderName] && telemetryContextProperties) {
			result[TelemetryContextHeaderName] = JSON.stringify(telemetryContextProperties);
		}
		if (!result[CallingServiceHeaderName] && callingServiceName) {
			result[CallingServiceHeaderName] = callingServiceName;
		}

		return result;
	}

	private refreshOnAuthError(): boolean {
		if (
			this.refreshDefaultQueryString === undefined &&
			this.refreshDefaultHeaders === undefined
		) {
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

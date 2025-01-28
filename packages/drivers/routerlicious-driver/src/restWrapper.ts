/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64, performanceNow } from "@fluid-internal/client-utils";
import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	GenericNetworkError,
	NonRetryableError,
	RateLimiter,
} from "@fluidframework/driver-utils/internal";
import {
	CorrelationIdHeaderName,
	DriverVersionHeaderName,
	RestLessClient,
	getAuthorizationTokenFromCredentials,
} from "@fluidframework/server-services-client";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
	numberFromString,
} from "@fluidframework/telemetry-utils/internal";
import fetch from "cross-fetch";
import safeStringify from "json-stringify-safe";

import type { AxiosRequestConfig, RawAxiosRequestHeaders } from "./axios.cjs";
import {
	getUrlForTelemetry,
	RouterliciousErrorTypes,
	throwR11sNetworkError,
} from "./errorUtils.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";
import { addOrUpdateQueryParams, type QueryStringType } from "./queryStringUtils.js";
import { RestWrapper } from "./restWrapperBase.js";
import { ITokenProvider, ITokenResponse } from "./tokens.js";

type AuthorizationHeaderGetter = (token: ITokenResponse) => string;
export type TokenFetcher = (refresh?: boolean) => Promise<ITokenResponse>;

const buildRequestUrl = (requestConfig: AxiosRequestConfig) =>
	requestConfig.baseURL !== undefined
		? `${requestConfig.baseURL ?? ""}${requestConfig.url ?? ""}`
		: (requestConfig.url ?? "");

const axiosBuildRequestInitConfig = (requestConfig: AxiosRequestConfig): RequestInit => {
	const requestInit: RequestInit = {
		method: requestConfig.method,
		// NOTE: I believe that although the Axios type permits non-string values in the header, here we are
		// guaranteed the requestConfig only has string values in its header.
		headers: requestConfig.headers as Record<string, string>,
		body: requestConfig.data,
	};
	return requestInit;
};

export interface IR11sResponse<T> {
	content: T;
	headers: Map<string, string>;
	propsToLog: ITelemetryBaseProperties;
	requestUrl: string;
}

/**
 * A utility function to create a Routerlicious response without any additional props as we might not have them always.
 * @param content - Response which is equivalent to content.
 * @returns A Routerlicious response without any extra props.
 */
export function createR11sResponseFromContent<T>(content: T): IR11sResponse<T> {
	return {
		content,
		headers: new Map(),
		propsToLog: {},
		requestUrl: "",
	};
}

function headersToMap(headers: Headers) {
	const newHeaders = new Map<string, string>();
	for (const [key, value] of headers.entries()) {
		newHeaders.set(key, value);
	}
	return newHeaders;
}

export function getPropsToLogFromResponse(headers: {
	// eslint-disable-next-line @rushstack/no-new-null
	get: (id: string) => string | undefined | null;
}) {
	interface LoggingHeader {
		headerName: string;
		logName: string;
	}

	// We rename headers so that otel doesn't scrub them away. Otel doesn't allow
	// certain characters in headers including '-'
	const headersToLog: LoggingHeader[] = [
		{ headerName: CorrelationIdHeaderName, logName: "requestCorrelationId" },
		{ headerName: "content-encoding", logName: "contentEncoding" },
		{ headerName: "content-type", logName: "contentType" },
	];
	const additionalProps: ITelemetryBaseProperties = {
		contentsize: numberFromString(headers.get("content-length")),
	};
	headersToLog.forEach((header) => {
		const headerValue = headers.get(header.headerName);
		if (headerValue !== undefined && headerValue !== null) {
			additionalProps[header.logName] = headerValue;
		}
	});

	return additionalProps;
}

class RouterliciousRestWrapper extends RestWrapper {
	private readonly restLess = new RestLessClient();
	private token: ITokenResponse | undefined;

	/**
	 * A locally maintained map which saves the number of retries for any REST api call made through restWrapper.
	 * It uses the href of the request url as a key against which it saves the retry counts. Retries are only counted in case of failures.
	 * This feature is added to enable FRS to have more telemetry insights into whether the requests are being retried from same client or multiple.
	 */
	private readonly retryCounter = new Map<string, number>();

	constructor(
		logger: ITelemetryLoggerExt,
		private readonly rateLimiter: RateLimiter,
		private readonly fetchRefreshedToken: TokenFetcher,
		private readonly getAuthorizationHeader: AuthorizationHeaderGetter,
		private readonly useRestLess: boolean,
		baseurl?: string,
		private tokenP?: Promise<ITokenResponse>,
		defaultQueryString: QueryStringType = {},
	) {
		super(baseurl, defaultQueryString);
	}

	protected async request<T>(
		requestConfig: AxiosRequestConfig,
		statusCode: number,
		canRetry = true,
	): Promise<IR11sResponse<T>> {
		if (requestConfig.params) {
			// delete the retry param, if any. We do this to ensure there is no retry added by any of callers, which would conflict with the one we maintain here in the retryCounter map.
			delete requestConfig.params.retry;
		}

		// Build the complete request url including baseUrl, url and query params. (all except 'retry' query param)
		let completeRequestUrl = addOrUpdateQueryParams(
			buildRequestUrl(requestConfig),
			requestConfig.params,
		);

		// Check whether this request has been made before or if it is a retry.
		// requestKey is built using the HTTP method appended with the complete URL ommitting the 'retry' param
		const requestKey = `${requestConfig.method ?? ""}|${completeRequestUrl.href}`;
		const requestRetryCount = this.retryCounter.get(requestKey);
		if (requestRetryCount) {
			completeRequestUrl = addOrUpdateQueryParams(completeRequestUrl, {
				retry: requestRetryCount,
			});
		}

		const config = {
			...requestConfig,
			headers: await this.generateHeaders(requestConfig.headers),
		};

		const translatedConfig = this.useRestLess ? this.restLess.translate(config) : config;
		const fetchRequestConfig = axiosBuildRequestInitConfig(translatedConfig);

		const res = await this.rateLimiter.schedule(async () => {
			const perfStart = performanceNow();
			const result = await fetch(completeRequestUrl, fetchRequestConfig).catch(
				async (error) => {
					// on failure, add the request entry into the retryCounter map to count the subsequent retries, if any
					this.retryCounter.set(requestKey, requestRetryCount ? requestRetryCount + 1 : 1);

					const telemetryProps = {
						driverVersion,
						retryCount: requestRetryCount,
						url: getUrlForTelemetry(completeRequestUrl.hostname, completeRequestUrl.pathname),
						requestMethod: fetchRequestConfig.method,
					};

					// Browser Fetch throws a TypeError on network error, `node-fetch` throws a FetchError
					const isNetworkError = ["TypeError", "FetchError"].includes(error?.name);
					const errorMessage = isNetworkError
						? `NetworkError: ${error.message}`
						: safeStringify(error);
					// If a service is temporarily down or a browser resource limit is reached, RestWrapper will throw
					// a network error with no status code (e.g. err:ERR_CONN_REFUSED or err:ERR_FAILED) and
					// the error message will start with NetworkError as defined in restWrapper.ts
					// If there exists a self-signed SSL certificates error, throw a NonRetryableError
					// TODO: instead of relying on string matching, filter error based on the error code like we do for websocket connections
					const err = errorMessage.includes("failed, reason: self signed certificate")
						? new NonRetryableError(
								errorMessage,
								RouterliciousErrorTypes.sslCertError,
								telemetryProps,
							)
						: new GenericNetworkError(
								errorMessage,
								errorMessage.startsWith("NetworkError"),
								telemetryProps,
							);
					throw err;
				},
			);
			return {
				response: result,
				duration: performanceNow() - perfStart,
			};
		});

		const response = res.response;
		const headers = headersToMap(response.headers);

		let start = performanceNow();
		const text = await response.text();
		const receiveContentTime = performanceNow() - start;

		const bodySize = text.length;
		start = performanceNow();
		const responseBody: any = response.headers
			.get("content-type")
			?.includes("application/json")
			? JSON.parse(text)
			: text;
		const parseTime = performanceNow() - start;

		// Success
		if (response.ok || response.status === statusCode) {
			// on successful response, remove the entry from the retryCounter map
			this.retryCounter.delete(requestKey);
			const result = responseBody as T;
			return {
				content: result,
				headers,
				requestUrl: completeRequestUrl.href,
				propsToLog: {
					...getPropsToLogFromResponse(headers),
					bodySize,
					receiveContentTime,
					parseTime,
					fetchTime: res.duration,
				},
			};
		}

		// Failure
		// on failure, add the request entry into the retryCounter map to count the subsequent retries
		this.retryCounter.set(requestKey, requestRetryCount ? requestRetryCount + 1 : 1);

		if (response.status === 401 && canRetry) {
			// Refresh Authorization header and retry once
			this.token = await this.fetchRefreshedToken(true /* refreshToken */);
			return this.request<T>({ ...config }, statusCode, false);
		}
		if (response.status === 429 && responseBody?.retryAfter > 0) {
			// Retry based on retryAfter[Seconds]
			return new Promise<IR11sResponse<T>>((resolve, reject) =>
				setTimeout(() => {
					// use the original request URL without the retryCount appended
					this.request<T>({ ...config }, statusCode)
						.then(resolve)
						.catch(reject);
				}, responseBody.retryAfter * 1000),
			);
		}

		const responseSummary =
			responseBody !== undefined
				? typeof responseBody === "string"
					? responseBody
					: safeStringify(responseBody)
				: response.statusText;
		throwR11sNetworkError(
			`R11s fetch error: ${responseSummary}`,
			response.status,
			responseBody?.retryAfter,
			{
				...getPropsToLogFromResponse(headers),
				driverVersion,
				url: getUrlForTelemetry(completeRequestUrl.hostname, completeRequestUrl.pathname),
				requestMethod: fetchRequestConfig.method,
			},
		);
	}

	private async generateHeaders(
		requestHeaders?: RawAxiosRequestHeaders | undefined,
	): Promise<RawAxiosRequestHeaders> {
		const token = await this.getToken();
		assert(token !== undefined, 0x679 /* token should be present */);
		const headers: RawAxiosRequestHeaders = {
			...requestHeaders,
			[DriverVersionHeaderName]: driverVersion,
			// NOTE: If this.authorizationHeader is undefined, should "Authorization" be removed entirely?
			Authorization: this.getAuthorizationHeader(token),
		};
		return headers;
	}

	public async getToken(): Promise<ITokenResponse> {
		if (this.token !== undefined) {
			return this.token;
		}
		const token = await (this.tokenP ?? this.fetchRefreshedToken());
		this.setToken(token);
		this.tokenP = undefined;
		return token;
	}

	public setToken(token: ITokenResponse) {
		this.token = token;
	}
}

export class RouterliciousStorageRestWrapper extends RouterliciousRestWrapper {
	private constructor(
		logger: ITelemetryLoggerExt,
		rateLimiter: RateLimiter,
		fetchToken: TokenFetcher,
		getAuthorizationHeader: AuthorizationHeaderGetter,
		useRestLess: boolean,
		baseurl?: string,
		initialTokenP?: Promise<ITokenResponse>,
		defaultQueryString: QueryStringType = {},
	) {
		super(
			logger,
			rateLimiter,
			fetchToken,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
			initialTokenP,
			defaultQueryString,
		);
	}

	public static load(
		tenantId: string,
		tokenFetcher: TokenFetcher,
		logger: ITelemetryLoggerExt,
		rateLimiter: RateLimiter,
		useRestLess: boolean,
		baseurl?: string,
		initialTokenP?: Promise<ITokenResponse>,
	): RouterliciousStorageRestWrapper {
		const defaultQueryString = {
			token: `${fromUtf8ToBase64(tenantId)}`,
		};

		const getAuthorizationHeader: AuthorizationHeaderGetter = (
			token: ITokenResponse,
		): string => {
			const credentials = {
				password: token.jwt,
				user: tenantId,
			};
			return getAuthorizationTokenFromCredentials(credentials);
		};

		const restWrapper = new RouterliciousStorageRestWrapper(
			logger,
			rateLimiter,
			tokenFetcher,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
			initialTokenP,
			defaultQueryString,
		);

		return restWrapper;
	}
}

export class RouterliciousOrdererRestWrapper extends RouterliciousRestWrapper {
	private constructor(
		logger: ITelemetryLoggerExt,
		rateLimiter: RateLimiter,
		fetchToken: TokenFetcher,
		getAuthorizationHeader: AuthorizationHeaderGetter,
		useRestLess: boolean,
		baseurl?: string,
		initialTokenP?: Promise<ITokenResponse>,
		defaultQueryString: QueryStringType = {},
	) {
		super(
			logger,
			rateLimiter,
			fetchToken,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
			initialTokenP,
			defaultQueryString,
		);
	}

	public static load(
		tokenFetcher: TokenFetcher,
		logger: ITelemetryLoggerExt,
		rateLimiter: RateLimiter,
		useRestLess: boolean,
		baseurl?: string,
		initialTokenP?: Promise<ITokenResponse>,
	): RouterliciousOrdererRestWrapper {
		const getAuthorizationHeader: AuthorizationHeaderGetter = (
			token: ITokenResponse,
		): string => {
			return `Basic ${token.jwt}`;
		};

		const restWrapper = new RouterliciousOrdererRestWrapper(
			logger,
			rateLimiter,
			tokenFetcher,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
			initialTokenP,
		);

		return restWrapper;
	}
}

export function toInstrumentedR11sOrdererTokenFetcher(
	tenantId: string,
	documentId: string | undefined,
	tokenProvider: ITokenProvider,
	logger: ITelemetryLoggerExt,
): TokenFetcher {
	const fetchOrdererToken = async (refreshToken?: boolean): Promise<ITokenResponse> => {
		return PerformanceEvent.timedExecAsync(
			logger,
			{
				eventName: "FetchOrdererToken",
				docId: documentId,
			},
			async () => {
				const ordererToken = await tokenProvider.fetchOrdererToken(
					tenantId,
					documentId,
					refreshToken,
				);

				return ordererToken;
			},
		);
	};
	return fetchOrdererToken;
}

export function toInstrumentedR11sStorageTokenFetcher(
	tenantId: string,
	documentId: string,
	tokenProvider: ITokenProvider,
	logger: ITelemetryLoggerExt,
): TokenFetcher {
	const fetchStorageToken = async (refreshToken?: boolean): Promise<ITokenResponse> => {
		return PerformanceEvent.timedExecAsync(
			logger,
			{
				eventName: "FetchStorageToken",
				docId: documentId,
			},
			async () => {
				// Craft credentials using tenant id and token
				const storageToken = await tokenProvider.fetchStorageToken(
					tenantId,
					documentId,
					refreshToken,
				);

				return storageToken;
			},
		);
	};
	return fetchStorageToken;
}

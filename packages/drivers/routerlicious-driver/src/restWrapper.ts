/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Just using the type from a node.js module does not introduce a runtime dependency.
// eslint-disable-next-line import/no-nodejs-modules
import type { ParsedUrlQueryInput } from "querystring";

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { RateLimiter } from "@fluidframework/driver-utils";
import {
	getAuthorizationTokenFromCredentials,
	RestLessClient,
	RestWrapper,
} from "@fluidframework/server-services-client";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import fetch from "cross-fetch";
import type { AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import safeStringify from "json-stringify-safe";
import { v4 as uuid } from "uuid";
import { throwR11sNetworkError } from "./errorUtils";
import { ITokenProvider, ITokenResponse } from "./tokens";
import { pkgVersion as driverVersion } from "./packageVersion";

type AuthorizationHeaderGetter = (token: ITokenResponse) => string;
type TokenFetcher = (refresh?: boolean) => Promise<ITokenResponse>;

const axiosRequestConfigToFetchRequestConfig = (
	requestConfig: AxiosRequestConfig,
): [RequestInfo, RequestInit] => {
	const requestInfo: string =
		requestConfig.baseURL !== undefined
			? `${requestConfig.baseURL}${requestConfig.url ?? ""}`
			: requestConfig.url ?? "";
	const requestInit: RequestInit = {
		method: requestConfig.method,
		// NOTE: I believe that although the Axios type permits non-string values in the header, here we are
		// guaranteed the requestConfig only has string values in its header.
		headers: requestConfig.headers as Record<string, string>,
		body: requestConfig.data,
	};
	return [requestInfo, requestInit];
};

export class RouterliciousRestWrapper extends RestWrapper {
	private readonly restLess = new RestLessClient();

	constructor(
		logger: ITelemetryLogger,
		private readonly rateLimiter: RateLimiter,
		private token: ITokenResponse,
		private readonly fetchRefreshedToken: TokenFetcher,
		private readonly getAuthorizationHeader: AuthorizationHeaderGetter,
		private readonly useRestLess: boolean,
		baseurl?: string,
		defaultQueryString: ParsedUrlQueryInput = {},
	) {
		super(baseurl, defaultQueryString);
	}

	protected async request<T>(
		requestConfig: AxiosRequestConfig,
		statusCode: number,
		canRetry = true,
	): Promise<T> {
		const config = {
			...requestConfig,
			headers: this.generateHeaders(requestConfig.headers),
		};

		const translatedConfig = this.useRestLess ? this.restLess.translate(config) : config;
		const fetchRequestConfig = axiosRequestConfigToFetchRequestConfig(translatedConfig);

		const response: Response = await this.rateLimiter.schedule(async () =>
			fetch(...fetchRequestConfig).catch(async (error) => {
				// Browser Fetch throws a TypeError on network error, `node-fetch` throws a FetchError
				const isNetworkError = ["TypeError", "FetchError"].includes(error?.name);
				throwR11sNetworkError(
					isNetworkError ? `NetworkError: ${error.message}` : safeStringify(error),
				);
			}),
		);

		const responseBody: any = response.headers.get("content-type")?.includes("application/json")
			? await response.json()
			: await response.text();

		// Success
		if (response.ok || response.status === statusCode) {
			const result: T = responseBody;
			return result;
		}
		// Failure
		if (response.status === 401 && canRetry) {
			// Refresh Authorization header and retry once
			this.token = await this.fetchRefreshedToken(true /* refreshToken */);
			return this.request<T>(config, statusCode, false);
		}
		if (response.status === 429 && responseBody?.retryAfter > 0) {
			// Retry based on retryAfter[Seconds]
			return new Promise<T>((resolve, reject) =>
				setTimeout(() => {
					this.request<T>(config, statusCode).then(resolve).catch(reject);
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
		);
	}

	private generateHeaders(
		requestHeaders?: AxiosRequestHeaders | undefined,
	): Record<string, string> {
		const correlationId = requestHeaders?.["x-correlation-id"] ?? uuid();

		return {
			...requestHeaders,
			// TODO: replace header names with CorrelationIdHeaderName and DriverVersionHeaderName from services-client
			// NOTE: Can correlationId actually be number | true?
			"x-correlation-id": correlationId as string,
			"x-driver-version": driverVersion,
			// NOTE: If this.authorizationHeader is undefined, should "Authorization" be removed entirely?
			"Authorization": this.getAuthorizationHeader(this.token),
		};
	}

	public getToken(): ITokenResponse {
		return this.token;
	}

	public setToken(token: ITokenResponse) {
		this.token = token;
	}
}

export class RouterliciousStorageRestWrapper extends RouterliciousRestWrapper {
	private constructor(
		logger: ITelemetryLogger,
		rateLimiter: RateLimiter,
		token: ITokenResponse,
		fetchToken: TokenFetcher,
		getAuthorizationHeader: AuthorizationHeaderGetter,
		useRestLess: boolean,
		baseurl?: string,
		defaultQueryString: ParsedUrlQueryInput = {},
	) {
		super(
			logger,
			rateLimiter,
			token,
			fetchToken,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
			defaultQueryString,
		);
	}

	public static async load(
		tenantId: string,
		documentId: string,
		tokenProvider: ITokenProvider,
		logger: ITelemetryLogger,
		rateLimiter: RateLimiter,
		useRestLess: boolean,
		baseurl?: string,
	): Promise<RouterliciousStorageRestWrapper> {
		const defaultQueryString = {
			token: `${fromUtf8ToBase64(tenantId)}`,
		};

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

		const getAuthorizationHeader: AuthorizationHeaderGetter = (
			token: ITokenResponse,
		): string => {
			const credentials = {
				password: token.jwt,
				user: tenantId,
			};
			return getAuthorizationTokenFromCredentials(credentials);
		};

		const storagetoken = await fetchStorageToken();

		const restWrapper = new RouterliciousStorageRestWrapper(
			logger,
			rateLimiter,
			storagetoken,
			fetchStorageToken,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
			defaultQueryString,
		);

		return restWrapper;
	}
}

export class RouterliciousOrdererRestWrapper extends RouterliciousRestWrapper {
	private constructor(
		logger: ITelemetryLogger,
		rateLimiter: RateLimiter,
		token: ITokenResponse,
		fetchToken: TokenFetcher,
		getAuthorizationHeader: AuthorizationHeaderGetter,
		useRestLess: boolean,
		baseurl?: string,
		defaultQueryString: ParsedUrlQueryInput = {},
	) {
		super(
			logger,
			rateLimiter,
			token,
			fetchToken,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
			defaultQueryString,
		);
	}

	public static async load(
		tenantId: string,
		documentId: string | undefined,
		tokenProvider: ITokenProvider,
		logger: ITelemetryLogger,
		rateLimiter: RateLimiter,
		useRestLess: boolean,
		baseurl?: string,
	): Promise<RouterliciousOrdererRestWrapper> {
		const getAuthorizationHeader: AuthorizationHeaderGetter = (
			token: ITokenResponse,
		): string => {
			return `Basic ${token.jwt}`;
		};

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

		const newtoken = await fetchOrdererToken();

		const restWrapper = new RouterliciousOrdererRestWrapper(
			logger,
			rateLimiter,
			newtoken,
			fetchOrdererToken,
			getAuthorizationHeader,
			useRestLess,
			baseurl,
		);

		return restWrapper;
	}
}

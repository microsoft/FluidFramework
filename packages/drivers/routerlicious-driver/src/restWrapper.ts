/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as querystring from "querystring";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { RateLimiter } from "@fluidframework/driver-utils";
import {
    getAuthorizationTokenFromCredentials,
    RestLessClient,
    RestWrapper,
} from "@fluidframework/server-services-client";
import fetch from "cross-fetch";
import type { AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import safeStringify from "json-stringify-safe";
import { v4 as uuid } from "uuid";
import { throwR11sNetworkError } from "./errorUtils";
import { ITokenProvider } from "./tokens";

type AuthorizationHeaderGetter = (refresh?: boolean) => Promise<string | undefined>;

const axiosRequestConfigToFetchRequestConfig = (requestConfig: AxiosRequestConfig): [RequestInfo, RequestInit] => {
    const requestInfo: string = requestConfig.baseURL !== undefined
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
    private authorizationHeader: string | undefined;
    private readonly restLess = new RestLessClient();

    constructor(
        logger: ITelemetryLogger,
        private readonly rateLimiter: RateLimiter,
        private readonly getAuthorizationHeader: AuthorizationHeaderGetter,
        private readonly useRestLess: boolean,
        baseurl?: string,
        defaultQueryString: querystring.ParsedUrlQueryInput = {},
    ) {
        super(baseurl, defaultQueryString);
    }

    public async load() {
        this.authorizationHeader = await this.getAuthorizationHeader();
    }

    protected async request<T>(requestConfig: AxiosRequestConfig, statusCode: number, canRetry = true): Promise<T> {
        const config = {
            ...requestConfig,
            headers: this.generateHeaders(requestConfig.headers),
        };

        const translatedConfig = this.useRestLess ? this.restLess.translate(config) : config;
        const fetchRequestConfig = axiosRequestConfigToFetchRequestConfig(translatedConfig);

        const response: Response = await this.rateLimiter.schedule(async () => fetch(...fetchRequestConfig)
            .catch(async (error) => {
                // Fetch throws a TypeError on network error
                const isNetworkError = error instanceof TypeError;
                throwR11sNetworkError(
                    isNetworkError ? `NetworkError: ${error.message}` : safeStringify(error));
            }));

        const responseBody: any = await response.clone().json().catch(async () => response.text());

        // Success
        if (response.ok || response.status === statusCode) {
            const result: T = responseBody;
            return result;
        }
        // Failure
        if (response.status === 401 && canRetry) {
            // Refresh Authorization header and retry once
            this.authorizationHeader = await this.getAuthorizationHeader(true);
            return this.request<T>(config, statusCode, false);
        }
        if (response.status === 429 && responseBody?.retryAfter > 0) {
            // Retry based on retryAfter[Seconds]
            return new Promise<T>((resolve, reject) => setTimeout(() => {
                this.request<T>(config, statusCode)
                    .then(resolve)
                    .catch(reject);
            }, responseBody.retryAfter * 1000));
        }

        const responseSummary = responseBody !== undefined
            ? typeof responseBody === "string" ? responseBody : safeStringify(responseBody)
            : response.statusText;
        throwR11sNetworkError(
            `R11s fetch error: ${responseSummary}`,
            response.status,
            responseBody?.retryAfter,
        );
    }

    private generateHeaders(requestHeaders?: AxiosRequestHeaders | undefined): Record<string, string> {
        const correlationId = requestHeaders?.["x-correlation-id"] || uuid();

        return {
            ...requestHeaders,
            // NOTE: Can correlationId actually be number | true?
            "x-correlation-id": correlationId as string,
            // NOTE: If this.authorizationHeader is undefined, should "Authorization" be removed entirely?
            "Authorization": this.authorizationHeader!,
        };
    }
}

export class RouterliciousStorageRestWrapper extends RouterliciousRestWrapper {
    private constructor(
        logger: ITelemetryLogger,
        rateLimiter: RateLimiter,
        getAuthorizationHeader: AuthorizationHeaderGetter,
        useRestLess: boolean,
        baseurl?: string,
        defaultQueryString: querystring.ParsedUrlQueryInput = {},
    ) {
        super(logger, rateLimiter, getAuthorizationHeader, useRestLess, baseurl, defaultQueryString);
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
        const getAuthorizationHeader: AuthorizationHeaderGetter = async (refresh?: boolean): Promise<string> => {
            // Craft credentials using tenant id and token
            const storageToken = await tokenProvider.fetchStorageToken(
                tenantId,
                documentId,
                refresh,
            );
            const credentials = {
                password: storageToken.jwt,
                user: tenantId,
            };
            return getAuthorizationTokenFromCredentials(credentials);
        };

        const restWrapper = new RouterliciousStorageRestWrapper(
            logger, rateLimiter, getAuthorizationHeader, useRestLess, baseurl, defaultQueryString);
        try {
            await restWrapper.load();
        } catch (e) {
            logger.sendErrorEvent({
                eventName: "R11sRestWrapperLoadFailure",
            }, e);
            await restWrapper.load();
        }
        return restWrapper;
    }
}

export class RouterliciousOrdererRestWrapper extends RouterliciousRestWrapper {
    private constructor(
        logger: ITelemetryLogger,
        rateLimiter: RateLimiter,
        getAuthorizationHeader: AuthorizationHeaderGetter,
        useRestLess: boolean,
        baseurl?: string,
        defaultQueryString: querystring.ParsedUrlQueryInput = {},
    ) {
        super(logger, rateLimiter, getAuthorizationHeader, useRestLess, baseurl, defaultQueryString);
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
        const getAuthorizationHeader: AuthorizationHeaderGetter = async (refresh?: boolean): Promise<string> => {
            const ordererToken = await tokenProvider.fetchOrdererToken(
                tenantId,
                documentId,
                refresh,
            );
            return `Basic ${ordererToken.jwt}`;
        };

        const restWrapper = new RouterliciousOrdererRestWrapper(
            logger, rateLimiter, getAuthorizationHeader, useRestLess, baseurl);
        try {
            await restWrapper.load();
        } catch (e) {
            logger.sendErrorEvent({
                eventName: "R11sRestWrapperLoadFailure",
            }, e);
            await restWrapper.load();
        }
        return restWrapper;
    }
}

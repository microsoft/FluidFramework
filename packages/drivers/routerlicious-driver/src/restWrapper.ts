/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { RateLimiter } from "@fluidframework/driver-utils";
import {
    getAuthorizationTokenFromCredentials,
    RestLessClient,
    RestWrapper,
} from "@fluidframework/server-services-client";
import Axios, { AxiosError, AxiosRequestConfig } from "axios";
import safeStringify from "json-stringify-safe";
import { v4 as uuid } from "uuid";
import { throwR11sNetworkError } from "./errorUtils";
import { ITokenProvider } from "./tokens";

type AuthorizationHeaderGetter = (refresh?: boolean) => Promise<string | undefined>;

export class RouterliciousRestWrapper extends RestWrapper {
    private authorizationHeader: string | undefined;
    private readonly restLess = new RestLessClient();

    constructor(
        private readonly logger: ITelemetryLogger,
        private readonly rateLimiter: RateLimiter,
        private readonly getAuthorizationHeader: AuthorizationHeaderGetter,
        private readonly useRestLess: boolean,
        baseurl?: string,
        defaultQueryString: Record<string, unknown> = {},
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

        try {
            const response = await this.rateLimiter.schedule(async () => Axios.request<T>(translatedConfig));
            return response.data;
        } catch (reason: any) {
            if (!reason || !reason?.isAxiosError) {
                // Unknown error, treat as critical error and immediately throw as non-retriable
                this.logger.sendErrorEvent({
                    eventName: "CriticalRequestError",
                    correlationId: config.headers["x-correlation-id"] as string,
                }, reason);
                throwR11sNetworkError(`Unknown Error on [${config.method}] to [${config.url}]: ${
                    safeStringify(reason)
                }`);
            }

            const axiosError = reason as AxiosError;
            if (axiosError.response?.status === statusCode) {
                // Axios misinterpreted as error, return as successful response
                return axiosError.response.data as T;
            }

            if (axiosError.response?.status === 401 && canRetry) {
                // Refresh Authorization header and retry once
                this.authorizationHeader = await this.getAuthorizationHeader(true);
                return this.request<T>(config, statusCode, false);
            }

            if (axiosError.response?.status === 429 && axiosError.response.data?.retryAfter > 0) {
                // Retry based on retryAfter[Seconds]
                return new Promise<T>((resolve, reject) => setTimeout(() => {
                    this.request<T>(config, statusCode)
                        .then(resolve)
                        .catch(reject);
                }, axiosError.response!.data.retryAfter * 1000));
            }

            // Allow anything else to be handled upstream
            throwR11sNetworkError(axiosError.message, axiosError.response?.status);
        }
    }

    private generateHeaders(requestHeaders?: Record<string, unknown>): Record<string, unknown> {
        const correlationId = requestHeaders?.["x-correlation-id"] || uuid();

        return {
            ...requestHeaders,
            "x-correlation-id": correlationId,
            "Authorization": this.authorizationHeader,
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
        defaultQueryString: Record<string, unknown> = {},
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
        const getAuthorizationHeader: AuthorizationHeaderGetter = async (): Promise<string> => {
            // Craft credentials using tenant id and token
            const storageToken = await tokenProvider.fetchStorageToken(
                tenantId,
                documentId,
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
        defaultQueryString: Record<string, unknown> = {},
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
    ): Promise<RouterliciousOrdererRestWrapper> {
        const getAuthorizationHeader: AuthorizationHeaderGetter = async (): Promise<string> => {
            const ordererToken = await tokenProvider.fetchOrdererToken(
                tenantId,
                documentId,
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

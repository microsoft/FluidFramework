/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { RateLimiter } from "@fluidframework/driver-utils";
import Axios, { AxiosRequestConfig } from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import { RouterliciousRestWrapper } from "../restWrapper";
import { R11sErrorType } from "../errorUtils";

describe("RouterliciousDriverRestWrapper", () => {
    const axiosMockAdapter = new AxiosMockAdapter(Axios);
    const rateLimiter = new RateLimiter(1);
    const testUrl = "/api/protected";

    // Set up mock request authentication
    let validToken: string | undefined;
    const token1 = "1234-auth-token-abcd";
    const token2 = "9876-auth-token-zyxw";
    const token3 = "abc-auth-token-123";
    let tokenQueue: string[] = [];
    // Pop a token off tokenQueue to generate an auth header
    const getAuthHeader = async () => `Bearer ${tokenQueue.shift() || ""}`;
    // Check if auth header token value matches current validToken
    const isValidAuthHeader = (header: string) => header.replace(/^Bearer /, "") === validToken;
    // Returns 200 on valid Authorization header; otherwise returns 401
    const replyWithAuth = (requestConfig: AxiosRequestConfig) => {
        if (isValidAuthHeader(requestConfig.headers?.Authorization)) {
            return [200, "OK"];
        }
        return [401, "Not Allowed"];
    };

    // Set up mock throttling
    let throttleDurationInMs: number;
    let throttledAt: number;
    const throttle = () => {
        throttledAt = Date.now();
    };
    const replyWithThrottling = () => {
        const retryAfterSeconds = (throttleDurationInMs - Date.now() - throttledAt) / 1000;
        const throttled = retryAfterSeconds > 0;
        if (throttled) {
            return [429, { retryAfter: retryAfterSeconds }];
        }
        return [200, "OK"];
    };

    let restWrapper: RouterliciousRestWrapper;

    beforeEach(async () => {
        // reset auth mocking
        validToken = undefined;
        tokenQueue = [token1, token2, token3];
        // reset throttling mocking
        throttledAt = 0;
        throttleDurationInMs = 50;

        axiosMockAdapter.reset();
        restWrapper = new RouterliciousRestWrapper(
            new TelemetryUTLogger(),
            rateLimiter,
            getAuthHeader,
            false,
        );
        await restWrapper.load();
    });

    describe("get()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            axiosMockAdapter.onGet(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            axiosMockAdapter.onGet(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            axiosMockAdapter.onGet(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a retriable error on 500", async () => {
            axiosMockAdapter.onGet(testUrl).reply(500);
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            axiosMockAdapter.onGet(testUrl).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            axiosMockAdapter.onGet(testUrl).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            axiosMockAdapter.onGet(testUrl).reply(404);
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });

    describe("post()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            axiosMockAdapter.onPost(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            axiosMockAdapter.onPost(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            axiosMockAdapter.onPost(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 500", async () => {
            axiosMockAdapter.onPost(testUrl).reply(500);
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            axiosMockAdapter.onPost(testUrl).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            axiosMockAdapter.onPost(testUrl).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            axiosMockAdapter.onPost(testUrl).reply(404);
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });

    describe("patch()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            axiosMockAdapter.onPatch(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            axiosMockAdapter.onPatch(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            axiosMockAdapter.onPatch(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 500", async () => {
            axiosMockAdapter.onPatch(testUrl).reply(500);
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            axiosMockAdapter.onPatch(testUrl).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            axiosMockAdapter.onPatch(testUrl).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            axiosMockAdapter.onPatch(testUrl).reply(404);
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });

    describe("delete()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            axiosMockAdapter.onDelete(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            axiosMockAdapter.onDelete(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            axiosMockAdapter.onDelete(testUrl).reply(replyWithAuth);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a retriable error on 500", async () => {
            axiosMockAdapter.onDelete(testUrl).reply(500);
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            axiosMockAdapter.onDelete(testUrl).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            axiosMockAdapter.onDelete(testUrl).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            axiosMockAdapter.onDelete(testUrl).reply(404);
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });
});

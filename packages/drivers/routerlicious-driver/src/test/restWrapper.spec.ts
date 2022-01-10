/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { RateLimiter } from "@fluidframework/driver-utils";
import fetchMock from "fetch-mock";
import * as nodeFetchModule from "node-fetch";
import { reset, replace } from "sinon";
import { RouterliciousRestWrapper } from "../restWrapper";
import { R11sErrorType } from "../errorUtils";

describe("RouterliciousDriverRestWrapper", () => {
    const rateLimiter = new RateLimiter(1);
    const testUrl = "https://contoso.com/api/protected";

    // Set up mock request authentication
    let validToken: string | undefined;
    const token1 = "1234-auth-token-abcd";
    const token2 = "9876-auth-token-zyxw";
    const token3 = "abc-auth-token-123";
    let tokenQueue: string[] = [];
    // Pop a token off tokenQueue to generate an auth header
    const getAuthHeader = async () => `Bearer ${tokenQueue.shift() || ""}`;
    // Check if auth header token value matches current validToken
    const isValidAuthHeader = (header: string | null) => header && header.replace(/^Bearer /, "") === validToken;
    // Returns 200 on valid Authorization header; otherwise returns 401
    const replyWithAuth = (_url, opts) => {
        if (isValidAuthHeader(opts.headers?.Authorization)) {
            return { status: 200, body: "OK" };
        }
        return { status: 401, body: "Not Allowed" };
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
            return { status: 429, body: { retryAfter: retryAfterSeconds } };
        }
        return { status: 200, body: "OK" };
    };

    let restWrapper: RouterliciousRestWrapper;

    const fetchMockSandbox = fetchMock.sandbox();
    replace(
        nodeFetchModule,
        "default",
        (fetchMockSandbox as unknown) as typeof nodeFetchModule.default,
    );

    beforeEach(async () => {
        // reset auth mocking
        validToken = undefined;
        tokenQueue = [token1, token2, token3];
        // reset throttling mocking
        throttledAt = 0;
        throttleDurationInMs = 50;

        fetchMockSandbox.resetBehavior();
        restWrapper = new RouterliciousRestWrapper(
            new TelemetryUTLogger(),
            rateLimiter,
            getAuthHeader,
            false,
        );
        await restWrapper.load();
    });
    after(() => {
        reset();
    });

    describe("get()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            fetchMockSandbox.get(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            fetchMockSandbox.get(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            fetchMockSandbox.get(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a retriable error on 500", async () => {
            fetchMockSandbox.get(testUrl, 500);
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            fetchMockSandbox.get(testUrl, replyWithThrottling);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            fetchMockSandbox.get(testUrl, { status: 429, body: { retryAfter: undefined } });
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            fetchMockSandbox.get(testUrl, 404);
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });

    describe("post()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            fetchMockSandbox.post(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            fetchMockSandbox.post(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            fetchMockSandbox.post(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 500", async () => {
            fetchMockSandbox.post(testUrl, 500);
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            fetchMockSandbox.post(testUrl, replyWithThrottling);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            fetchMockSandbox.post(testUrl, { status: 429, body: { retryAfter: undefined } });
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            fetchMockSandbox.post(testUrl, 404);
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });

    describe("patch()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            fetchMockSandbox.patch(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            fetchMockSandbox.patch(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            fetchMockSandbox.patch(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 500", async () => {
            fetchMockSandbox.patch(testUrl, 500);
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            fetchMockSandbox.patch(testUrl, replyWithThrottling);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            fetchMockSandbox.patch(testUrl, { status: 429, body: { retryAfter: undefined } });
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            fetchMockSandbox.patch(testUrl, 404);
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });

    describe("delete()", () => {
        it("sends a request with auth headers", async () => {
            validToken = token1;
            fetchMockSandbox.delete(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            validToken = token1;
            fetchMockSandbox.delete(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            validToken = token1;
            fetchMockSandbox.delete(testUrl, replyWithAuth);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a retriable error on 500", async () => {
            fetchMockSandbox.delete(testUrl, 500);
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            fetchMockSandbox.delete(testUrl, replyWithThrottling);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            fetchMockSandbox.delete(testUrl, { status: 429, body: { retryAfter: undefined } });
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            fetchMockSandbox.delete(testUrl, 404);
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
    });
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { RateLimiter } from "@fluidframework/driver-utils";
import nock from "nock";
import { RouterliciousRestWrapper } from "../restWrapper";
import { R11sErrorType } from "../errorUtils";

describe("RouterliciousDriverRestWrapper", () => {
    const rateLimiter = new RateLimiter(1);
    const testHost = "http://localhost:3030";
    const testPath = "/api/protected";
    const testUrl = `${testHost}${testPath}`;

    // Set up mock request authentication
    const token1 = "1234-auth-token-abcd";
    const token2 = "9876-auth-token-zyxw";
    const token3 = "abc-auth-token-123";
    let tokenQueue: string[] = [];
    // Pop a token off tokenQueue to generate an auth header
    const getAuthHeader = async () => `Bearer ${tokenQueue.shift() || ""}`;

    // Set up mock throttling
    let throttleDurationInMs: number;
    let throttledAt: number;
    const throttle = () => {
        throttledAt = Date.now();
    };
    function replyWithThrottling() {
        const retryAfterSeconds = (throttleDurationInMs - Date.now() - throttledAt) / 1000;
        const throttled = retryAfterSeconds > 0;
        if (throttled) {
            return [429, { retryAfter: retryAfterSeconds }];
        }
        return [200, "OK"];
    }

    let restWrapper: RouterliciousRestWrapper;

    beforeEach(async () => {
        // reset auth mocking
        tokenQueue = [token1, token2, token3];
        // reset throttling mocking
        throttledAt = 0;
        throttleDurationInMs = 50;

        restWrapper = new RouterliciousRestWrapper(
            new TelemetryUTLogger(),
            rateLimiter,
            getAuthHeader,
            false,
        );
        await restWrapper.load();
    });
    after(() => {
        nock.restore();
    });

    describe("get()", () => {
        it("sends a request with auth headers", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).get(testPath).reply(200);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).get(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).get(testPath).reply(200);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).get(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).get(testPath).reply(401);
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: false,
                errorType: DriverErrorType.authorizationError,
            });
        });
        it("throws a retriable error on 500", async () => {
            nock(testHost).get(testPath).reply(500);
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            nock(testHost).get(testPath).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.get(testUrl));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            nock(testHost).get(testPath).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            nock(testHost).get(testPath).reply(404);
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
        it("throws retriable error on Network Error", async () => {
            nock(testHost).get(testPath).replyWithError({ code: "ECONNRESET" });
            await assert.rejects(restWrapper.get(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
    });

    describe("post()", () => {
        it("sends a request with auth headers", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).post(testPath).reply(200);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).post(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).post(testPath).reply(200);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).post(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).post(testPath).reply(401);
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: DriverErrorType.authorizationError,
            });
        });
        it("throws a retriable error on 500", async () => {
            nock(testHost).post(testPath).reply(500);
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            nock(testHost).post(testPath).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.post(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            nock(testHost).post(testPath).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            nock(testHost).post(testPath).reply(404);
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
        it("throws retriable error on Network Error", async () => {
            nock(testHost).post(testPath).replyWithError({ code: "ECONNRESET" });
            await assert.rejects(restWrapper.post(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
    });

    describe("patch()", () => {
        it("sends a request with auth headers", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).patch(testPath).reply(200);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).patch(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).patch(testPath).reply(200);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).patch(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).patch(testPath).reply(401);
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: DriverErrorType.authorizationError,
            });
        });
        it("throws a retriable error on 500", async () => {
            nock(testHost).patch(testPath).reply(500);
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            nock(testHost).patch(testPath).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.patch(testUrl, { test: "payload" }));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            nock(testHost).patch(testPath).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            nock(testHost).patch(testPath).reply(404);
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
        it("throws retriable error on Network Error", async () => {
            nock(testHost).patch(testPath).replyWithError({ code: "ECONNRESET" });
            await assert.rejects(restWrapper.patch(testUrl, { test: "payload" }), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
    });

    describe("delete()", () => {
        it("sends a request with auth headers", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).delete(testPath).reply(200);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("retries a request with fresh auth headers on 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).delete(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).delete(testPath).reply(200);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a non-retriable error on 2nd 401", async () => {
            nock(testHost, { reqheaders: { authorization: `Bearer ${token1}` } }).delete(testPath).reply(401);
            nock(testHost, { reqheaders: { authorization: `Bearer ${token2}` } }).delete(testPath).reply(401);
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: false,
                errorType: DriverErrorType.authorizationError,
            });
        });
        it("throws a retriable error on 500", async () => {
            nock(testHost).delete(testPath).reply(500);
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("retries with delay on 429 with retryAfter", async () => {
            throttle();
            nock(testHost).delete(testPath).reply(replyWithThrottling);
            await assert.doesNotReject(restWrapper.delete(testUrl));
        });
        it("throws a retriable error on 429 without retryAfter", async () => {
            nock(testHost).delete(testPath).reply(429, { retryAfter: undefined });
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
        it("throws a non-retriable error on 404", async () => {
            nock(testHost).delete(testPath).reply(404);
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: false,
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
            });
        });
        it("throws retriable error on Network Error", async () => {
            nock(testHost).delete(testPath).replyWithError({ code: "ECONNRESET" });
            await assert.rejects(restWrapper.delete(testUrl), {
                canRetry: true,
                errorType: DriverErrorType.genericNetworkError,
            });
        });
    });
});

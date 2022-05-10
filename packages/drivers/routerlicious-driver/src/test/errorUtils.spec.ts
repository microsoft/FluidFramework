/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DriverErrorType, IThrottlingWarning } from "@fluidframework/driver-definitions";
import {
    createR11sNetworkError,
    throwR11sNetworkError,
    R11sErrorType,
    errorObjectFromSocketError,
} from "../errorUtils";

describe("ErrorUtils", () => {
    describe("createR11sNetworkError()", () => {
        it("creates non-retriable authorization error on 401", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 401);
            assert.strictEqual(error.errorType, DriverErrorType.authorizationError);
            assert.strictEqual(error.canRetry, false);
        });
        it("creates non-retriable authorization error on 403", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 403);
            assert.strictEqual(error.errorType, DriverErrorType.authorizationError);
            assert.strictEqual(error.canRetry, false);
        });
        it("creates non-retriable not-found error on 404", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 404);
            assert.strictEqual(error.errorType, R11sErrorType.fileNotFoundOrAccessDeniedError);
            assert.strictEqual(error.canRetry, false);
        });
        it("creates retriable error on 429 with retry-after", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 429, 5000);
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError);
            assert.strictEqual(error.canRetry, true);
            assert.strictEqual((error as IThrottlingWarning).retryAfterSeconds, 5);
        });
        it("creates retriable error on 429 without retry-after", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 429);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, true);
        });
        it("creates retriable error on 500", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 500);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, true);
        });
        it("creates retriable error on Network Error", () => {
            const message = "NetworkError: failed to fetch";
            const error = createR11sNetworkError(message);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, true);
        });
        it("creates retriable error on anything else with retryAfter", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 400, 100000);
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError);
            assert.strictEqual(error.canRetry, true);
            assert.strictEqual((error as any).retryAfterSeconds, 100);
        });
        it("creates non-retriable error on anything else", () => {
            const message = "test error";
            const error = createR11sNetworkError(message);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, false);
            const error2 = createR11sNetworkError(message, 400);
            assert.strictEqual(error2.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error2.canRetry, false);
        });
    });
    describe("throwR11sNetworkError()", () => {
        it("throws non-retriable authorization error on 401", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 401);
            }, {
                errorType: DriverErrorType.authorizationError,
                canRetry: false,
            });
        });
        it("throws non-retriable authorization error on 403", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 403);
            }, {
                errorType: DriverErrorType.authorizationError,
                canRetry: false,
            });
        });
        it("throws non-retriable not-found error on 404", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 404);
            }, {
                errorType: R11sErrorType.fileNotFoundOrAccessDeniedError,
                canRetry: false,
            });
        });
        it("throws retriable error on 429 with retry-after", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 429, 5000);
            }, {
                errorType: DriverErrorType.throttlingError,
                canRetry: true,
                retryAfterSeconds: 5,
            });
        });
        it("throws retriable error on 429 without retry-after", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 429);
            }, {
                errorType: DriverErrorType.genericNetworkError,
                canRetry: true,
            });
        });
        it("throws retriable error on 500", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 500);
            }, {
                errorType: DriverErrorType.genericNetworkError,
                canRetry: true,
            });
        });
        it("throws retriable error on Network Error", () => {
            const message = "NetworkError: failed to fetch";
            assert.throws(() => {
                throwR11sNetworkError(message);
            }, {
                errorType: DriverErrorType.genericNetworkError,
                canRetry: true,
            });
        });
        it("throws retriable error on anything else with retryAfter", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 400, 200000);
            }, {
                errorType: DriverErrorType.throttlingError,
                canRetry: true,
                retryAfterSeconds: 200,
            });
        });
        it("throws non-retriable error on anything else", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message);
            }, {
                errorType: DriverErrorType.genericNetworkError,
                canRetry: false,
            });
            assert.throws(() => {
                throwR11sNetworkError(message, 400);
            }, {
                errorType: DriverErrorType.genericNetworkError,
                canRetry: false,
            });
        });
    });
    describe("errorObjectFromSocketError()", () => {
        const handler = "test_handler";
        const message = "test error";
        const assertExpectedMessage = (actualMessage: string) => {
            assert(actualMessage.includes(message), "R11s error should include socket error message");
            assert(actualMessage.includes(handler), "R11s error should include handler name");
        };
        it("creates non-retriable authorization error on 401", () => {
            const error = errorObjectFromSocketError({
                code: 401,
                message,
            }, handler);
            assertExpectedMessage(error.message);
            assert.strictEqual(error.errorType, DriverErrorType.authorizationError);
            assert.strictEqual(error.canRetry, false);
            assert.strictEqual((error as any).statusCode, 401);
        });
        it("creates non-retriable authorization error on 403", () => {
            const error = errorObjectFromSocketError({
                code: 403,
                message,
            }, handler);
            assertExpectedMessage(error.message);
            assert.strictEqual(error.errorType, DriverErrorType.authorizationError);
            assert.strictEqual(error.canRetry, false);
            assert.strictEqual((error as any).statusCode, 403);
        });
        it("creates non-retriable not-found error on 404", () => {
            const error = errorObjectFromSocketError({
                code: 404,
                message,
            }, handler);
            assertExpectedMessage(error.message);
            assert.strictEqual(error.errorType, R11sErrorType.fileNotFoundOrAccessDeniedError);
            assert.strictEqual(error.canRetry, false);
            assert.strictEqual((error as any).statusCode, 404);
        });
        it("creates retriable error on 429 with retry-after", () => {
            const error = errorObjectFromSocketError({
                code: 429,
                message,
                retryAfterMs: 5000,
            }, handler);
            assertExpectedMessage(error.message);
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError);
            assert.strictEqual(error.canRetry, true);
            assert.strictEqual((error as IThrottlingWarning).retryAfterSeconds, 5);
            assert.strictEqual((error as any).statusCode, 429);
        });
        it("creates retriable error on 429 without retry-after", () => {
            const error = errorObjectFromSocketError({
                code: 429,
                message,
            }, handler);
            assertExpectedMessage(error.message);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, true);
        });
        it("creates retriable error on 500", () => {
            const error = errorObjectFromSocketError({
                code: 500,
                message,
            }, handler);
            assertExpectedMessage(error.message);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, true);
            assert.strictEqual((error as any).statusCode, 500);
        });
        it("creates retriable error on 400 with retryAfter", () => {
            const error = errorObjectFromSocketError({
                code: 400,
                message,
                retryAfterMs: 300000,
            }, handler);
            assertExpectedMessage(error.message);
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError);
            assert.strictEqual(error.canRetry, true);
            assert.strictEqual((error as any).retryAfterSeconds, 300);
            assert.strictEqual((error as any).statusCode, 400);
        });
    });
});

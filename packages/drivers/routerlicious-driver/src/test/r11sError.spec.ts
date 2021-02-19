/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DriverErrorType, IThrottlingWarning } from "@fluidframework/driver-definitions";
import { createR11sNetworkError, throwR11sNetworkError, R11sErrorType } from "../r11sError";

describe("R11sError", () => {
    describe("createR11sNetworkError()", () => {
        it("creates non-retriable authorization error on 401", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 401);
            assert.strictEqual(error.errorType, R11sErrorType.authorizationError);
            assert.strictEqual(error.canRetry, false);
        });
        it("creates non-retriable authorization error on 403", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 403);
            assert.strictEqual(error.errorType, R11sErrorType.authorizationError);
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
            const error = createR11sNetworkError(message, 429, undefined, 5);
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError);
            assert.strictEqual(error.canRetry, true);
            assert.strictEqual((error as IThrottlingWarning).retryAfterSeconds, 5);
        });
        it("creates non-retriable error on 429 without retry-after", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 429);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, false);
        });
        it("creates retriable error on 500", () => {
            const message = "test error";
            const error = createR11sNetworkError(message, 500);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, true);
        });
        it("creates retriable error on anything else", () => {
            const message = "test error";
            const error = createR11sNetworkError(message);
            assert.strictEqual(error.errorType, DriverErrorType.genericNetworkError);
            assert.strictEqual(error.canRetry, true);
        });
    });
    describe("throwR11sNetworkError()", () => {
        it("throws non-retriable authorization error on 401", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 401);
            }, {
                errorType: R11sErrorType.authorizationError,
                canRetry: false,
            });
        });
        it("throws non-retriable authorization error on 403", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 403);
            }, {
                errorType: R11sErrorType.authorizationError,
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
                throwR11sNetworkError(message, 429, undefined, 5);
            }, {
                errorType: DriverErrorType.throttlingError,
                canRetry: true,
                retryAfterSeconds: 5,
            });
        });
        it("throws non-retriable error on 429 without retry-after", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message, 429);
            }, {
                errorType: DriverErrorType.genericNetworkError,
                canRetry: false,
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
        it("throws retriable error on anything else", () => {
            const message = "test error";
            assert.throws(() => {
                throwR11sNetworkError(message);
            }, {
                errorType: DriverErrorType.genericNetworkError,
                canRetry: true,
            });
        });
    });
});

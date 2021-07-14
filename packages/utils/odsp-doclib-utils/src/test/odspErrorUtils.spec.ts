/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverErrorType, IThrottlingWarning } from "@fluidframework/driver-definitions";
import { createWriteError } from "@fluidframework/driver-utils";
import { OdspErrorType } from "@fluidframework/odsp-driver-definitions";
import { createOdspNetworkError, invalidFileNameStatusCode } from "../odspErrorUtils";

//* test createOdspNetworkError around the props that should be added

describe("createOdspNetworkError", () => {
    function assertCustomPropertySupport(err: any) {
        err.asdf = "asdf";
        if (err.getTelemetryProperties !== undefined) {
            assert.equal(err.getTelemetryProperties().asdf, "asdf", "Error should have property asdf");
        }
        else {
            assert.fail("Error should support getTelemetryProperties()");
        }
    }

    it("GenericNetworkError Test_1", async () => {
        const networkError = createOdspNetworkError("Test Message", 500);
        assert.equal(networkError.errorType, DriverErrorType.genericNetworkError,
            "Error should be a genericNetworkError");
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.canRetry, true, "default is canRetry");
    });

    it("GenericNetworkError Test_2", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            400 /* statusCode */,
            undefined /* retryAfterSeconds */);
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("Error should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.canRetry, false, "400 is non-retryable");
            assert.equal(networkError.statusCode, 400, "status code should be preserved");
        }
    });

    it("GenericNetworkError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            500 /* statusCode */);
        assertCustomPropertySupport(networkError);
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("Error should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.canRetry, true, "500 is retryable");
        }
    });

    it("AuthorizationError Test 401", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            401 /* statusCode */);
        assert.equal(networkError.errorType, DriverErrorType.authorizationError,
            "Error should be an authorizationError");
        assertCustomPropertySupport(networkError);
    });

    it("AuthorizationError Test 403", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            403 /* statusCode */);
        if (networkError.errorType !== DriverErrorType.authorizationError) {
            assert.fail("Error should be an authorizationError");
        }
        else {
            assert.equal(networkError.errorType, DriverErrorType.authorizationError, "canRetry should be preserved");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        }
    });

    it("OutOfStorageError Test 507", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            507 /* statusCode */);
        assert.equal(networkError.errorType, OdspErrorType.outOfStorageError,
            "Error should be an OutOfStorageError");
        assertCustomPropertySupport(networkError);
    });

    it("FileNotFoundOrAccessDeniedError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            404 /* statusCode */);
        assertCustomPropertySupport(networkError);
        if (networkError.errorType !== DriverErrorType.fileNotFoundOrAccessDeniedError) {
            assert.fail("Error should be a fileNotFoundOrAccessDeniedError");
        }
        else {
            assert.equal(networkError.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                "canRetry should be preserved");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        }
    });

    it("InvalidFileNameError Test 414", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            414 /* statusCode */);
        assert.equal(networkError.errorType, OdspErrorType.invalidFileNameError,
            "Error should be an InvalidFileNameError");
        assertCustomPropertySupport(networkError);
    });

    it("InvalidFileNameError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            invalidFileNameStatusCode /* statusCode */);
        assert.equal(networkError.errorType, OdspErrorType.invalidFileNameError,
            "Error should be an InvalidFileNameError");
        assertCustomPropertySupport(networkError);
    });

    it("ThrottlingError 400 Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            400 /* statusCode */,
            100 /* retryAfterSeconds */);
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.errorType, DriverErrorType.genericNetworkError, "Error should be a generic");
        assert.equal((networkError as any).retryAfterSeconds, undefined, "retryAfterSeconds should not be set");
    });

    it("ThrottlingError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            429,
            100 /* retryAfterSeconds */) as IThrottlingWarning;
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.errorType, DriverErrorType.throttlingError, "Error should be a throttlingError");
        assert.equal(networkError.retryAfterSeconds, 100, "retryAfterSeconds should be preserved");
    });

    it("WriteError Test", async () => {
        const writeError = createWriteError("Test Error");
        assertCustomPropertySupport(writeError);
        assert.equal(writeError.errorType, DriverErrorType.writeError, "Error should be a writeError");
        assert.equal(writeError.canRetry, false, "Error should be critical");
    });
});

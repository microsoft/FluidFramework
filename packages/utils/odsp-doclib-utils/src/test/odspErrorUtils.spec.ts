/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { DriverErrorType, IThrottlingWarning } from "@fluidframework/driver-definitions";
import { createWriteError, GenericNetworkError } from "@fluidframework/driver-utils";
import { OdspErrorType, OdspError, IOdspError } from "@fluidframework/odsp-driver-definitions";
import { isILoggingError } from "@fluidframework/telemetry-utils";
import { createOdspNetworkError, enrichOdspError } from "../odspErrorUtils";
import { pkgVersion } from "../packageVersion";

describe("OdspErrorUtils", () => {
    function assertCustomPropertySupport(err: any) {
        err.asdf = "asdf";
        assert(isILoggingError(err), "Error should support getTelemetryProperties()");
        assert.equal(err.getTelemetryProperties().asdf, "asdf", "Error should have property asdf");
    }

    describe("createOdspNetworkError", () => {
        it("GenericNetworkError Test_1", () => {
            const networkError = createOdspNetworkError("Test Message", 500);
            assert(networkError.errorType === DriverErrorType.genericNetworkError,
                "Error should be a genericNetworkError");
            assertCustomPropertySupport(networkError);
            assert.equal(networkError.canRetry, true, "default is canRetry");
        });

        it("GenericNetworkError Test_2", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                400 /* statusCode */,
                undefined /* retryAfterSeconds */);
                assert(networkError.errorType === DriverErrorType.genericNetworkError, "Error should be a genericNetworkError");
                assert.equal(networkError.canRetry, false, "400 is non-retryable");
                assert.equal(networkError.statusCode, 400, "status code should be preserved");
        });

        it("GenericNetworkError Test", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                500 /* statusCode */);
            assertCustomPropertySupport(networkError);
            assert(networkError.errorType === DriverErrorType.genericNetworkError, "Error should be a genericNetworkError");
            assert.equal(networkError.canRetry, true, "500 is retryable");
        });

        it("AuthorizationError Test 401", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                401 /* statusCode */);
            assert(networkError.errorType === DriverErrorType.authorizationError,
                "Error should be an authorizationError");
            assertCustomPropertySupport(networkError);
        });

        it("AuthorizationError Test 403", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                403 /* statusCode */);
            assert(networkError.errorType === DriverErrorType.authorizationError, "Error should be an authorizationError");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        });

        it("OutOfStorageError Test 507", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                507 /* statusCode */);
            assert(networkError.errorType === OdspErrorType.outOfStorageError,
                "Error should be an OutOfStorageError");
            assertCustomPropertySupport(networkError);
        });

        it("FileNotFoundOrAccessDeniedError Test", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                404 /* statusCode */);
            assertCustomPropertySupport(networkError);
            assert(networkError.errorType === DriverErrorType.fileNotFoundOrAccessDeniedError,
                "Error should be a fileNotFoundOrAccessDeniedError");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        });

        it("InvalidFileNameError Test 414", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                414 /* statusCode */);
            assert(networkError.errorType === OdspErrorType.invalidFileNameError,
                "Error should be an InvalidFileNameError");
            assertCustomPropertySupport(networkError);
        });

        it("ThrottlingError 400 Test", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                400 /* statusCode */,
                100 /* retryAfterSeconds */);
            assertCustomPropertySupport(networkError);
            assert(networkError.errorType === DriverErrorType.genericNetworkError, "Error should be a genericNetworkError");
            assert.equal((networkError as any).retryAfterSeconds, undefined, "retryAfterSeconds should not be set");
        });

        it("ThrottlingError Test", () => {
            const networkError = createOdspNetworkError(
                "Test Message",
                429,
                100 /* retryAfterSeconds */) as IThrottlingWarning;
            assertCustomPropertySupport(networkError);
            assert(networkError.errorType === DriverErrorType.throttlingError, "Error should be a throttlingError");
            assert.equal(networkError.retryAfterSeconds, 100, "retryAfterSeconds should be preserved");
        });
    });

    describe("enrichError", () => {
        it("enriched with online flag", () => {
            const error = new GenericNetworkError("Some message", false, { driverVersion: pkgVersion }) as GenericNetworkError & OdspError;
            enrichOdspError(error);

            assert(typeof error.online === "string");
            assert(isILoggingError(error));
            assert(typeof error.getTelemetryProperties().online === "string");
        });
        it("enriched with facetCodes", () => {
            const responseText = '{ "error": { "message":"hello", "code": "foo", "innerError": { "code": "bar" } } }';
            const error = createOdspNetworkError(
                "Test Message",
                400,
                undefined,
                undefined, /* response */
                responseText,
            );

            assert.deepStrictEqual(error.facetCodes, ["bar", "foo"]);
            assert(isILoggingError(error));
            assert.equal(error.getTelemetryProperties().response, responseText);
            assert.equal(error.getTelemetryProperties().innerMostErrorCode, "bar");
        });
        it("enriched with response data", () => {
            const mockHeaders = {
                get: (id: string) => {
                    if (["sprequestduration", "content-length"].includes(id)) {
                        return 5;
                    }
                    return `mock header ${id}`;
                },
            };
            const error = createOdspNetworkError(
                "Test Message",
                400,
                undefined,
                { type: "fooType", headers: mockHeaders } as unknown as Response, /* response */
                "non-standard response text");

            assert(isILoggingError(error));
            assert.equal(error.getTelemetryProperties().response, undefined, "If response text is not standard don't log it");
            assert.equal(error.getTelemetryProperties().responseType, "fooType");
            assert.equal(error.getTelemetryProperties().sprequestguid, "mock header sprequestguid");
            assert.equal(error.getTelemetryProperties().requestId, "mock header request-id");
            assert.equal(error.getTelemetryProperties().clientRequestId, "mock header client-request-id");
            assert.equal(error.getTelemetryProperties().xMsedgeRef, "mock header x-msedge-ref");
            assert.equal(error.getTelemetryProperties().serverRetries, "mock header X-Fluid-Retries");
            assert.equal(error.getTelemetryProperties().sprequestduration, 5);
            assert.equal(error.getTelemetryProperties().contentsize, 5);
            assert.equal(error.getTelemetryProperties().serverEpoch, "mock header x-fluid-epoch");
            assert.equal((error as IOdspError).serverEpoch, "mock header x-fluid-epoch");
        });
    });

    it("WriteError Test", () => {
        const writeError = createWriteError("Test Error", { driverVersion: pkgVersion });
        assertCustomPropertySupport(writeError);
        assert(writeError.errorType === DriverErrorType.writeError, "Error should be a writeError");
        assert.equal(writeError.canRetry, false, "Error should be critical");
    });
});

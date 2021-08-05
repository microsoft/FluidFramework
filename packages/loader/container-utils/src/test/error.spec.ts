/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { isILoggingError, LoggingError, normalizeError } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { CreateContainerError, CreateProcessingError, DataProcessingError, GenericError } from "../error";

describe("Errors", () => {
    describe("GenericError coercion via CreateContainerError", () => {
        it("Should add errorType and props, as a new object", () => {
            const originalError: any = { hello: "world" };
            const testError = CreateContainerError(originalError, { foo: "bar" });

            assert(testError.errorType === ContainerErrorType.genericError);
            assert(testError !== originalError);
            assert((testError as any).hello === undefined);
            assert((testError as GenericError).error === originalError);
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === "bar");
        });
        it("Should add errorType and props to non-object input", () => {
            const originalError = "womp womp";
            const testError = CreateContainerError(originalError, { foo: "bar" });

            assert(testError.errorType === ContainerErrorType.genericError);
            assert(testError.message === "womp womp");
            assert((testError as GenericError).error === originalError);
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === "bar");
            assert(testError.getTelemetryProperties().message === "womp womp");
        });
        it("Should preserve existing errorType, but return new object if not a fully valid error", () => {
            const originalError = { errorType: "someErrorType" }; // missing message and telemetry prop functions
            const testError = CreateContainerError(originalError);

            assert(testError.errorType === "someErrorType");
            assert(testError !== originalError);
        });
        it("Should ignore non-string errorType", () => {
            const originalError = { errorType: 3 };
            const testError = CreateContainerError(originalError);

            assert(testError.errorType === ContainerErrorType.genericError);
        });
        it("Should not expose original error props for telemetry besides message", () => {
            const originalError: any = { hello: "world", message: "super important" };
            const testError = CreateContainerError(originalError, { foo: "bar" });

            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().hello === undefined);
            assert(testError.getTelemetryProperties().message === "super important");
        });
        it("Should preserve the stack", () => {
            const originalError = new Error();
            const testError = CreateContainerError(originalError);

            assert((testError as GenericError).stack === originalError.stack);
        });
        it("Should add errorType but preserve existing telemetry props, as a new object", () => {
            const loggingError = new LoggingError("hello", { foo: "bar" });
            const testError = CreateContainerError(loggingError);

            assert(testError.errorType === ContainerErrorType.genericError);
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === "bar");
            assert(testError as any !== loggingError);
            assert((testError as GenericError).error === loggingError);
        });
        it("Should preserve telemetry props and existing errorType, and return same object", () => {
            const loggingError = new LoggingError("hello", { foo: "bar" }) as LoggingError & { errorType: string };
            loggingError.errorType = "someErrorType";
            const testError = CreateContainerError(loggingError);

            assert(testError.errorType === "someErrorType");
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === "bar");
            assert(testError as any === loggingError);
        });
    });
    describe("Additional CreateContainerError tests", () => {
        function assertCustomPropertySupport(err: any) {
            err.asdf = "asdf";
            assert(isILoggingError(err), "Error should support getTelemetryProperties()");
            assert.equal(err.getTelemetryProperties().asdf, "asdf", "Error should have property asdf");
        }
        it("Check double conversion of general error", async () => {
            const err = {
                message: "Test Error",
            };
            const error1 = CreateContainerError(err);
            const error2 = CreateContainerError(error1);
            assertCustomPropertySupport(error1);
            assertCustomPropertySupport(error2);
            assert.deepEqual(error1, error2, "Both errors should be same!!");
            assert.deepEqual(error2.message, err.message, "Message text should not be lost!!");
        });
        it("Check frozen error", async () => {
            const err = {
                message: "Test Error",
            };
            CreateContainerError(Object.freeze(err));
        });
        it("Preserve existing properties", async () => {
            const err1 = {
                errorType: "Something",
                message: "Test Error",
                canRetry: true,
            };
            const error1 = CreateContainerError(err1);
            const error2 = CreateContainerError(Object.freeze(error1));
            assert.equal(error1.errorType, err1.errorType, "Preserve errorType 1");
            assert.equal(error2.errorType, err1.errorType, "Preserve errorType 2");
        });
    });

    describe("DataProcessingError coercion via CreateProcessingError", () => {
        it("Should preserve the stack", () => {
            const originalError = new Error();
            const testError = CreateProcessingError(originalError, "anErrorCode", undefined);

            assert((testError as any).stack === originalError.stack);
        });
        it("Should skip coercion for valid Fluid Error", () => {
            const originalError = normalizeError("boo", { errorCodeIfNone: "originalErrorCode" });
            const coercedError = CreateProcessingError(originalError, "anErrorCode", undefined);

            assert(coercedError as any === originalError);
            assert(coercedError.fluidErrorCode === "originalErrorCode");
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
        });
        it("Should skip coercion for LoggingError with errorType", () => {
            const originalError = new LoggingError(
                "Inherited error message", {
                    errorType: "Some error type",
                    otherProperty: "Considered PII-free property",
                });
            const coercedError = CreateProcessingError(originalError, "anErrorCode", undefined);

            assert(coercedError as any === originalError);
            assert(coercedError.fluidErrorCode === "anErrorCode");
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
        });
        it("Should coerce non-LoggingError object with errorType", () => {
            const originalError = {
                errorType: "Some error type",
            };
            const coercedError = CreateProcessingError(originalError, "anErrorCode", undefined);

            assert(coercedError as any !== originalError);
            assert(coercedError instanceof DataProcessingError);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.fluidErrorCode === "anErrorCode");
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().untrustedOrigin === 1);
            assert(coercedError.message === "[object Object]");
        });
        it("Should coerce LoggingError missing errorType", () => {
            const originalError = new LoggingError(
                "Inherited error message", {
                    otherProperty: "Considered PII-free property",
                });
            const coercedError = CreateProcessingError(originalError, "anErrorCode", undefined);

            assert(coercedError as any !== originalError);
            assert(coercedError instanceof DataProcessingError);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.fluidErrorCode === "anErrorCode");
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().untrustedOrigin === 1);
            assert(coercedError.message === "Inherited error message");
            assert(coercedError.getTelemetryProperties().otherProperty === "Considered PII-free property", "telemetryProps not copied over by normalizeError");
        });

        it("Should not fail coercing malformed inputs", () => {
            const originalMalformations = [
                null,
                undefined,
                false,
                true,
                3.14,
                Symbol("Unique"),
                () => {},
                [],
                [1,2,3],
            ];
            const coercedErrors = originalMalformations.map((value) =>
                CreateProcessingError(value, "anErrorCode", undefined),
            );

            assert(
                coercedErrors.every(
                    (error) =>
                        error.errorType === ContainerErrorType.dataProcessingError &&
                        error.getTelemetryProperties().dataProcessingError === 1 &&
                        error.getTelemetryProperties().untrustedOrigin === 1),
        );
            assert(
                coercedErrors.every(
                    (error) => typeof error.message === "string" && error.fluidErrorCode === "anErrorCode",
                ),
            );
            assert(
                !originalMalformations.some(
                    (value) =>
                        typeof value === "string" ||
                        (typeof value === "object" &&
                            !Array.isArray(value) &&
                            value !== null),
                ),
                "Neither strings nor objects are considered malformed",
            );
        });

        it("Should be coercible from a string message", () => {
            const originalMessage = "Example of some thrown string";
            const coercedError = CreateProcessingError(originalMessage, "anErrorCode", undefined);

            assert(coercedError.message === originalMessage);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.fluidErrorCode === "anErrorCode");
        });

        it("Should be coercible from a property object (no errorType)", () => {
            const originalError = {
                message: "Inherited error message",
            };
            const coercedError = CreateProcessingError(originalError, "anErrorCode", undefined);

            assert(coercedError.message === originalError.message);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.fluidErrorCode === "anErrorCode");
        });

        it("op props should be logged when coerced", () => {
            const originalError = {
                message: "Inherited error message",
            };
            const op: ISequencedDocumentMessage = { sequenceNumber: 42 } as any;
            const coercedError = CreateProcessingError(originalError, "anErrorCode", op);

            assert(isILoggingError(coercedError));
            assert(coercedError.getTelemetryProperties().messageSequenceNumber === op.sequenceNumber);
        });

        it("op props should be logged even when not coerced", () => {
            const originalError = {
                errorType: "hello",
            };
            const op: ISequencedDocumentMessage = { sequenceNumber: 42 } as any;
            const coercedError = CreateProcessingError(originalError, "anErrorCode", op);

            assert(isILoggingError(coercedError));
            assert(coercedError.getTelemetryProperties().messageSequenceNumber === op.sequenceNumber);
        });
    });
});

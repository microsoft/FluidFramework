/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { isILoggingError, LoggingError, normalizeError } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { DataCorruptionError, DataProcessingError, GenericError } from "../error";

// NOTE about this (temporary) alias:
// CreateContainerError has been removed, with most call sites now using normalizeError.
// This represents some small behavior changes, highlighted by the diffs in these tests.
// They should be removed in a follow-up PR since they're redudnant with normalizeError's tests
const CreateContainerErrorViaNormalize = (error, props?) => normalizeError(error, { props });

describe("Errors", () => {
    describe("GenericError coercion via normalizeError (formerly CreateContainerError)", () => {
        it("Should add errorType and props, as a new object", () => {
            const originalError: any = { hello: "world" };
            const testError = CreateContainerErrorViaNormalize(originalError, { foo: "bar" });

            assert(testError.errorType === ContainerErrorType.genericError);
            assert(testError !== originalError);
            assert((testError as any).hello === undefined);
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === "bar");
        });
        it("Should add errorType and props to non-object input", () => {
            const originalError = "womp womp";
            const testError = CreateContainerErrorViaNormalize(originalError, { foo: "bar" });

            assert(testError.errorType === ContainerErrorType.genericError);
            assert(testError.message === "womp womp");
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === "bar");
            assert(testError.getTelemetryProperties().message === "womp womp");
        });
        it("Should not preserve existing errorType if not a fully valid error", () => {
            const originalError = { errorType: "someErrorType" }; // missing message and telemetry prop functions
            const testError = CreateContainerErrorViaNormalize(originalError);

            assert(testError.errorType === "genericError");
            assert(testError !== originalError);
        });
        it("Should ignore non-string errorType", () => {
            const originalError = { errorType: 3 };
            const testError = CreateContainerErrorViaNormalize(originalError);

            assert(testError.errorType === ContainerErrorType.genericError);
        });
        it("Should not expose original error props for telemetry besides message", () => {
            const originalError: any = { hello: "world", message: "super important" };
            const testError = CreateContainerErrorViaNormalize(originalError, { foo: "bar" });

            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().hello === undefined);
            assert(testError.getTelemetryProperties().message === "super important");
        });
        it("Should preserve the stack", () => {
            const originalError = new Error();
            const testError = CreateContainerErrorViaNormalize(originalError);

            assert((testError as GenericError).stack === originalError.stack);
        });
        it("Should add errorType but drop telemetry props, as a new object", () => {
            const loggingError = new LoggingError("hello", { foo: "bar" });
            const testError = CreateContainerErrorViaNormalize(loggingError);

            assert(testError.errorType === ContainerErrorType.genericError);
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === undefined, "telemetryProps shouldn't be copied when wrapping");
            assert(testError as any !== loggingError);
        });

        it("Should preserve telemetry props and existing errorType, and return same object", () => {
            const loggingError = new LoggingError("hello", { foo: "bar" }) as LoggingError & { errorType: string };
            loggingError.errorType = "someErrorType";
            const testError = CreateContainerErrorViaNormalize(loggingError);

            assert(testError.errorType === "someErrorType");
            assert(isILoggingError(testError));
            assert(testError.getTelemetryProperties().foo === "bar");
            assert(testError as any === loggingError);
        });
        it("Check double conversion of generic error", async () => {
            const err = {
                message: "Test Error",
            };
            const error1 = CreateContainerErrorViaNormalize(err);
            const error2 = CreateContainerErrorViaNormalize(error1);
            assert.deepEqual(error1, error2, "Both errors should be same!!");
            assert.deepEqual(error2.message, err.message, "Message text should not be lost!!");
        });
    });
    describe("DataProcessingError.create", () => {
        it("Should yield a DataProcessingError", () => {
            const dpe = DataProcessingError.create("Some message", "someCodepath");
            assert(dpe instanceof DataProcessingError);
            assert(dpe.errorType === ContainerErrorType.dataProcessingError);
            assert(dpe.getTelemetryProperties().dataProcessingError === 1);
            assert(dpe.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
            assert(dpe.getTelemetryProperties().untrustedOrigin === 1);
        });
    });
    describe("DataProcessingError coercion via DataProcessingError.wrapIfUnrecognized", () => {
        it("Should preserve the stack", () => {
            const originalError = new Error();
            const testError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", undefined);

            assert((testError as any).stack === originalError.stack);
        });
        it("Should skip coercion for valid Fluid Error", () => {
            const originalError = new DataCorruptionError("some message", {});
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", undefined);

            assert(coercedError as any === originalError);
            assert(coercedError.errorType === ContainerErrorType.dataCorruptionError);
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
        });
        it("Should skip coercion for LoggingError with errorType", () => {
            const originalError = new LoggingError(
                "Inherited error message", {
                    errorType: "Some error type",
                    otherProperty: "Considered PII-free property",
                });
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", undefined);

            assert(coercedError as any === originalError);
            assert(coercedError.errorType === "Some error type");
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
        });
        it("Should coerce normalized external error", () => {
            const originalError = normalizeError("boo");
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", undefined);

            assert(coercedError as any !== originalError);
            assert(coercedError instanceof DataProcessingError);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
            assert(coercedError.getTelemetryProperties().untrustedOrigin === 1);
        });
        it("Should coerce non-LoggingError object with errorType", () => {
            const originalError = {
                errorType: "Some error type",
            };
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", undefined);

            assert(coercedError as any !== originalError);
            assert(coercedError instanceof DataProcessingError);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
            assert(coercedError.getTelemetryProperties().untrustedOrigin === 1);
            assert(coercedError.message === "[object Object]");
        });
        it("Should coerce LoggingError missing errorType", () => {
            const originalError = new LoggingError(
                "Inherited error message", {
                    otherProperty: "Considered PII-free property",
                });
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", undefined);

            assert(coercedError as any !== originalError);
            assert(coercedError instanceof DataProcessingError);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
            assert(coercedError.getTelemetryProperties().untrustedOrigin === 1);
            assert(coercedError.message === "Inherited error message");
            assert(coercedError.getTelemetryProperties().otherProperty === undefined, "telemetryProps shouldn't be copied when wrapping");
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
                [1, 2, 3],
            ];
            const coercedErrors = originalMalformations.map((value) =>
                DataProcessingError.wrapIfUnrecognized(value, "someCodepath", undefined),
            );

            assert(
                coercedErrors.every(
                    (error) =>
                        typeof error.message === "string" &&
                        error.errorType === ContainerErrorType.dataProcessingError &&
                        error.getTelemetryProperties().dataProcessingError === 1 &&
                        error.getTelemetryProperties().dataProcessingCodepath === "someCodepath" &&
                        error.getTelemetryProperties().untrustedOrigin === 1),
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
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalMessage, "someCodepath", undefined);

            assert(coercedError.message === originalMessage);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
        });

        it("Should be coercible from a property object (no errorType)", () => {
            const originalError = {
                message: "Inherited error message",
            };
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", undefined);

            assert(coercedError.message === originalError.message);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
        });

        it("op props should be logged when coerced", () => {
            const originalError = {
                message: "Inherited error message",
            };
            const op: ISequencedDocumentMessage = { sequenceNumber: 42 } as any;
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", op);

            assert(isILoggingError(coercedError));
            assert(coercedError.getTelemetryProperties().messageSequenceNumber === op.sequenceNumber);
        });

        it("op props should be logged even when not coerced", () => {
            const originalError = {
                errorType: "hello",
            };
            const op: ISequencedDocumentMessage = { sequenceNumber: 42 } as any;
            const coercedError = DataProcessingError.wrapIfUnrecognized(originalError, "someCodepath", op);

            assert(isILoggingError(coercedError));
            assert(coercedError.getTelemetryProperties().messageSequenceNumber === op.sequenceNumber);
        });
    });
});

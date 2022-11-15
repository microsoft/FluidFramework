/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { isILoggingError, LoggingError, normalizeError } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { DataCorruptionError, DataProcessingError } from "../error";

describe("Errors", () => {
    describe("DataProcessingError.create", () => {
        it("Should yield a DataProcessingError", () => {
            const dpe = DataProcessingError.create("Some message", "someCodepath", undefined, { someProp: 1234 });
            assert(dpe instanceof DataProcessingError);
            assert(dpe.errorType === ContainerErrorType.dataProcessingError);
            assert(dpe.message === "Some message");
            assert(dpe.getTelemetryProperties().someProp === 1234);
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
        it("Should coerce external error object even with errorType", () => {
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
            assert(coercedError.getTelemetryProperties().untrustedOrigin === undefined);
            assert(coercedError.message === "Inherited error message");
            assert(coercedError.getTelemetryProperties().otherProperty === "Considered PII-free property", "telemetryProps should be copied when wrapping");
        });

        it("Should coerce Normalized LoggingError with errorType", () => {
            const originalError = new LoggingError(
                "Inherited error message", {
                    otherProperty: "Considered PII-free property",
                });
            const normalizedLoggingError = normalizeError(originalError);
            const coercedError = DataProcessingError.wrapIfUnrecognized(normalizedLoggingError, "someCodepath", undefined);
            assert(coercedError as any !== originalError);
            assert(coercedError instanceof DataProcessingError);
            assert(coercedError.errorType === ContainerErrorType.dataProcessingError);
            assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
            assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
            assert(coercedError.getTelemetryProperties().untrustedOrigin === undefined);
            assert(coercedError.message === "Inherited error message");
            assert(coercedError.getTelemetryProperties().otherProperty === "Considered PII-free property", "telemetryProps should be copied when wrapping");
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

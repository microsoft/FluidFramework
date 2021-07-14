/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { isILoggingError, LoggingError } from "@fluidframework/telemetry-utils";
import { CreateContainerError, CreateProcessingError, GenericError } from "../error";

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
        });
        it("Should preserve existing errorType, and return same object", () => {
            const originalError = { errorType: "someErrorType" };
            const testError = CreateContainerError(originalError);

            assert(testError.errorType === "someErrorType");
            assert(testError === originalError);
        });
        it("Should ignore non-string errorType", () => {
            const originalError = { errorType: 3 };
            const testError = CreateContainerError(originalError);

            assert(testError.errorType === ContainerErrorType.genericError);
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

    //* Test me with different combos of IErrorBase and LoggingError
    describe("DataProcessingError coercion via CreateProcessingError", () => {
        it("Should preserve the stack", () => {
            const originalError = new Error();
            const testError = CreateProcessingError(originalError, undefined);

            assert((testError as any).stack === originalError.stack);
        });
        it("Should skip coercion for LoggingErrors", () => {
            const originalError = new LoggingError(
                "Inherited error message", {
                    errorType: "Demoted error type",
                    otherProperty: "Considered PII-free property",
                });
            const coercedError = CreateProcessingError(originalError, undefined);

            assert(coercedError as any === originalError);
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
                CreateProcessingError(value, undefined),
            );

            assert(
                coercedErrors.every(
                    (error) =>
                        error.errorType ===
                        ContainerErrorType.dataProcessingError,
                ),
            );
            assert(
                coercedErrors.every(
                    (error) => typeof error.message === "string",
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
            const coercedError = CreateProcessingError(originalMessage, undefined);

            assert(coercedError.message === originalMessage);
        });

        it("Should be coercible from a property object", () => {
            const originalError = {
                message: "Inherited error message",
                errorType: "specialErrorType",
            };
            const coercedError = CreateProcessingError(originalError, undefined);

            assert(coercedError.message === originalError.message);
            assert(
                coercedError.errorType ===
                    "specialErrorType",
            );
        });
    });
});

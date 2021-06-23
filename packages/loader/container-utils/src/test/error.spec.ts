/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { isILoggingError, LoggingError } from "@fluidframework/telemetry-utils";
import { CreateContainerError, CreateProcessingError } from "../error";

describe("Errors", () => {
    describe("GenericError coercion", () => {
        it("Should have an errorType", () => {
            const testError = CreateContainerError({});

            assert(testError.errorType === ContainerErrorType.genericError);
        });
        it("Should preserve the stack", () => {
            const originalError = new Error();
            const testError = CreateContainerError(originalError);

            // eslint-disable-next-line @typescript-eslint/dot-notation
            assert(testError["stack"] === originalError.stack);
        });
        it("Wrap LoggingError with no errorType", () => {
            const loggingError = new LoggingError("hello", { foo: "bar" });
            const testError = CreateContainerError(loggingError);

            assert(testError.errorType === ContainerErrorType.genericError);
            assert(isILoggingError(testError));
        });
    });

    describe("DataProcessingError coercion", () => {
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
            const originalProps = {
                message: "Inherited error message",
                otherProperty: "Presumed PII-full property",
                errorType: "specialErrorType", // will be overwritten
            };
            const coercedError = CreateProcessingError(originalProps, undefined);

            assert(coercedError.message === originalProps.message);
            assert(
                coercedError.errorType ===
                    ContainerErrorType.dataProcessingError,
            );
            assert((coercedError as any).otherProperty === undefined);
        });
    });
});

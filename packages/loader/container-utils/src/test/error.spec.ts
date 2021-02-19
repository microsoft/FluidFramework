/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";
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

            assert(testError["stack"] === originalError.stack);
        });
    });

    describe("DataProcessingError coercion", () => {
        it("Should skip coercion for LoggingErrors", () => {
            const originalError = new LoggingError("Inherited error message", {
                errorType: "Demoted error type",
                otherProperty: "Considered PII-free property",
            });
            const coercedError = CreateProcessingError(originalError);

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
            ];
            const coercedErrors = originalMalformations.map((value) =>
                CreateProcessingError(value),
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
                coercedErrors.reduce(
                    (messages, error) => messages.add(error.message),
                    new Set(),
                ).size === 1,
                "All malformed inputs should generate a common error.message",
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
            const coercedError = CreateProcessingError(originalMessage);

            assert(coercedError.message === originalMessage);
        });

        it("Should be coercible from a property object", () => {
            const originalProps = {
                message: "Inherited error message",
                otherProperty: "Presumed PII-full property",
            };
            const coercedError = CreateProcessingError(originalProps);

            assert(coercedError.message === originalProps.message);
            assert(
                coercedError.errorType ===
                    ContainerErrorType.dataProcessingError,
            );
            assert((coercedError as any).otherProperty === undefined);
        });
    });
});

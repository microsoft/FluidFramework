/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";
import { DataCorruptionError, CreateCorruptionError } from "../error";

describe("Errors", () => {
    describe("DataCorruptionError coercion", () => {
        it("Should skip coercion for matching types", () => {
            const originalError = new DataCorruptionError(
                "Example error message",
                {},
            );
            const coercedError = CreateCorruptionError(originalError);

            assert(coercedError === originalError);
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
                CreateCorruptionError(value),
            );

            assert(
                coercedErrors.every(
                    (error) =>
                        error.errorType ===
                        ContainerErrorType.dataCorruptionError,
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
            const coercedError = CreateCorruptionError(originalMessage);

            assert(coercedError.message === originalMessage);
        });

        it("Should be coercible from a property object", () => {
            const originalProps = {
                message: "Inherited error message",
                errorType: "Overwritten error type",
                otherProperty: "Presumed PII-full property",
            };
            const coercedError = CreateCorruptionError(originalProps);

            assert(coercedError.message === originalProps.message);
            assert(
                coercedError.errorType ===
                    ContainerErrorType.dataCorruptionError,
            );
            assert(coercedError.errorSubType === undefined);
            assert((coercedError as any).otherProperty === undefined);
        });

        it("Should be coercible from a logging error", () => {
            const originalError = new LoggingError("Inherited error message", {
                errorType: "Demoted error type",
                otherProperty: "Considered PII-free property",
            });
            const coercedError = CreateCorruptionError(originalError);

            assert(coercedError.message === originalError.message);
            assert(
                coercedError.errorType ===
                    ContainerErrorType.dataCorruptionError,
            );
            assert(
                coercedError.errorSubType === (originalError as any).errorType,
            );
            assert(
                (coercedError as any).otherProperty ===
                    (originalError as any).otherProperty,
            );
        });
    });
});

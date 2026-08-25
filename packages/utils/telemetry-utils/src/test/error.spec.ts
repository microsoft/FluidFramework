/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { AssertionError } from "@fluidframework/core-utils/internal";

import {
	DataCorruptionError,
	DataProcessingError,
	failWithTelemetry,
	UsageError,
} from "../error.js";
import { LoggingError, isILoggingError, normalizeError } from "../errorLogging.js";
import { isFluidError } from "../fluidErrorBase.js";
import { MockLogger } from "../mockLogger.js";

describe("Errors", () => {
	describe("failWithTelemetry", () => {
		it("throws an AssertionError with telemetry properties", () => {
			let actual: unknown;
			try {
				failWithTelemetry(0xabc, undefined, { safeProperty: 1 });
			} catch (error: unknown) {
				actual = error;
			}

			assert(actual instanceof AssertionError);
			assert.equal(actual.message, "0xabc");
			assert.equal(actual.constantMessage, "0xabc");
			assert(isILoggingError(actual));
			assert.deepEqual(actual.getTelemetryProperties(), {
				safeProperty: 1,
				constantMessage: "0xabc",
			});
		});

		it("logs the assertion when given a logger", () => {
			const mockLogger = new MockLogger();
			assert.throws(() =>
				failWithTelemetry("constant message", mockLogger.toTelemetryLogger(), {
					safeProperty: 1,
				}),
			);

			mockLogger.assertMatch([
				{
					eventName: "AssertionError",
					error: "constant message",
					constantMessage: "constant message",
					safeProperty: 1,
				},
			]);
		});
	});

	describe("DataCorruptionError.create", () => {
		it("Should yield a DataCorruptionError", () => {
			const dce = DataCorruptionError.create("Some message", "someCodepath", undefined, {
				someProp: 1234,
			});
			assert(dce instanceof DataCorruptionError);
			assert(dce.errorType === FluidErrorTypes.dataCorruptionError);
			assert(dce.message === "Some message");
			assert(dce.getTelemetryProperties().someProp === 1234);
			assert(dce.getTelemetryProperties().dataProcessingError === 1);
			assert(dce.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
			assert(dce.getTelemetryProperties().untrustedOrigin === 1);
		});
	});
	describe("DataProcessingError.create", () => {
		it("Should yield a DataProcessingError", () => {
			const dpe = DataProcessingError.create("Some message", "someCodepath", undefined, {
				someProp: 1234,
			});
			assert(dpe instanceof DataProcessingError);
			assert(dpe.errorType === FluidErrorTypes.dataProcessingError);
			assert(dpe.message === "Some message");
			assert(dpe.getTelemetryProperties().someProp === 1234);
			assert(dpe.getTelemetryProperties().dataProcessingError === 1);
			assert(dpe.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
			assert(dpe.getTelemetryProperties().untrustedOrigin === 1);
		});
	});
	describe("DataProcessingError coercion via DataProcessingError.wrapIfUnrecognized", () => {
		it("Should preserve the stack", () => {
			const originalError = new Error("Test error");
			const testError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				undefined,
			);

			assert(testError.stack === originalError.stack);
		});
		it("Should skip coercion for valid Fluid Error", () => {
			const originalError = new DataCorruptionError("some message", {});
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				undefined,
			);

			assert((coercedError as unknown) === originalError);
			assert(coercedError.errorType === FluidErrorTypes.dataCorruptionError);
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
		});
		it("Should skip coercion for LoggingError with errorType", () => {
			const originalError = new LoggingError("Inherited error message", {
				errorType: "Some error type",
				otherProperty: "some safe-to-log property",
			});
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				undefined,
			);

			assert((coercedError as unknown) === originalError);
			assert(coercedError.errorType === "Some error type");
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
		});
		it("Should coerce normalized external error", () => {
			const originalError = normalizeError("boo");
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				undefined,
			);

			assert((coercedError as unknown) !== originalError);
			assert(coercedError instanceof DataProcessingError);
			assert(coercedError.errorType === FluidErrorTypes.dataProcessingError);
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
			assert(coercedError.getTelemetryProperties().untrustedOrigin === 1);
		});
		it("Should coerce external error object even with errorType", () => {
			const originalError = {
				errorType: "Some error type",
			};
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				undefined,
			);

			assert((coercedError as unknown) !== originalError);
			assert(coercedError instanceof DataProcessingError);
			assert(coercedError.errorType === FluidErrorTypes.dataProcessingError);
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
			assert(coercedError.getTelemetryProperties().untrustedOrigin === 1);
			assert(coercedError.message === "[object Object]");
		});
		it("Should coerce LoggingError missing errorType", () => {
			const originalError = new LoggingError("Inherited error message", {
				otherProperty: "some safe-to-log property",
			});
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				undefined,
			);

			assert((coercedError as unknown) !== originalError);
			assert(coercedError instanceof DataProcessingError);
			assert(coercedError.errorType === FluidErrorTypes.dataProcessingError);
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
			assert(coercedError.getTelemetryProperties().untrustedOrigin === undefined);
			assert(coercedError.message === "Inherited error message");
			assert(
				coercedError.getTelemetryProperties().otherProperty === "some safe-to-log property",
				"telemetryProps should be copied when wrapping",
			);
		});

		it("Should coerce Normalized LoggingError with errorType", () => {
			const originalError = new LoggingError("Inherited error message", {
				otherProperty: "some safe-to-log property",
			});
			const normalizedLoggingError = normalizeError(originalError);
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				normalizedLoggingError,
				"someCodepath",
				undefined,
			);
			assert((coercedError as unknown) !== originalError);
			assert(coercedError instanceof DataProcessingError);
			assert(coercedError.errorType === FluidErrorTypes.dataProcessingError);
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
			assert(coercedError.getTelemetryProperties().untrustedOrigin === undefined);
			assert(coercedError.message === "Inherited error message");
			assert(
				coercedError.getTelemetryProperties().otherProperty === "some safe-to-log property",
				"telemetryProps should be copied when wrapping",
			);
		});

		it("Should not fail coercing malformed inputs", () => {
			const originalMalformations = [
				// eslint-disable-next-line unicorn/no-null
				null,
				undefined,
				false,
				true,
				3.14,
				Symbol("Unique"),
				(): void => {},
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
						error.errorType === FluidErrorTypes.dataProcessingError &&
						error.getTelemetryProperties().dataProcessingError === 1 &&
						error.getTelemetryProperties().dataProcessingCodepath === "someCodepath" &&
						error.getTelemetryProperties().untrustedOrigin === 1,
				),
			);
			assert(
				!originalMalformations.some(
					(value) =>
						typeof value === "string" ||
						(typeof value === "object" && !Array.isArray(value) && value !== null),
				),
				"Neither strings nor objects are considered malformed",
			);
		});

		it("Should be coercible from a string message", () => {
			const originalMessage = "Example of some thrown string";
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalMessage,
				"someCodepath",
				undefined,
			);

			assert(coercedError.message === originalMessage);
			assert(coercedError.errorType === FluidErrorTypes.dataProcessingError);
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
		});

		it("Should be coercible from a property object (no errorType)", () => {
			const originalError = {
				message: "Inherited error message",
			};
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				undefined,
			);

			assert(coercedError.message === originalError.message);
			assert(coercedError.errorType === FluidErrorTypes.dataProcessingError);
			assert(coercedError.getTelemetryProperties().dataProcessingError === 1);
			assert(coercedError.getTelemetryProperties().dataProcessingCodepath === "someCodepath");
		});

		it("op props should be logged when coerced", () => {
			const originalError = {
				message: "Inherited error message",
			};
			const op = { sequenceNumber: 42 };
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				op,
			);

			assert(isILoggingError(coercedError));
			assert(
				coercedError.getTelemetryProperties().messageSequenceNumber === op.sequenceNumber,
			);
		});

		it("op props should be logged even when not coerced", () => {
			const originalError = {
				errorType: "hello",
			};
			const op = { sequenceNumber: 42 };
			const coercedError = DataProcessingError.wrapIfUnrecognized(
				originalError,
				"someCodepath",
				op,
			);

			assert(isILoggingError(coercedError));
			assert(
				coercedError.getTelemetryProperties().messageSequenceNumber === op.sequenceNumber,
			);
		});
	});

	describe("Type guards", () => {
		// Although isFluidError should give us a guarentee of catching UsageError,
		// this test gives one more layer of protection in case this logic changes.
		it("isFluidError returns true for UsageError", () => {
			assert(isFluidError(new UsageError("test")));
		});
	});
});

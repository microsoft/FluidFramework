/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { FluidErrorTypes } from "@fluidframework/core-interfaces";
import { GenericError, DataCorruptionError } from "../error.js";
import { MockLogger } from "../mockLogger.js";
import { createChildLogger } from "../logger.js";

describe("Check if the errorType field matches after sending/receiving via Container error classes", () => {
	// In all tests below, the `stack` prop will be left out of validation because it is difficult to properly
	// mock a stack for a mocked error.
	let mockLogger: MockLogger;
	beforeEach(() => {
		mockLogger = new MockLogger();
	});

	describe("Send and receive GenericError instances", () => {
		it("Send and receive a GenericError with no attached error.", () => {
			const testError = new GenericError("genericError");
			mockLogger.toTelemetryLogger().sendErrorEvent({ eventName: "A" }, testError);
			assert(
				mockLogger.matchEvents([
					{
						eventName: "A",
						category: "error",
						message: "genericError",
						errorType: FluidErrorTypes.genericError,
						error: "genericError",
					},
				]),
			);
		});

		// Dangling error objects of any type will be ignored (see constructor):
		it("Send and receive a GenericError with a dangling error of any type.", () => {
			const testError = new GenericError("genericError", "placeholder");
			mockLogger.toTelemetryLogger().sendErrorEvent({ eventName: "A" }, testError);
			assert(
				mockLogger.matchEvents([
					{
						eventName: "A",
						category: "error",
						message: "genericError",
						errorType: FluidErrorTypes.genericError,
						error: "genericError",
					},
				]),
			);
		});
		it("Send and receive a GenericError with a dangling error of object type.", () => {
			const testErrorObj = new Error("some error");
			const testError = new GenericError("genericError", testErrorObj);
			mockLogger.toTelemetryLogger().sendErrorEvent({ eventName: "A" }, testError);
			assert(
				mockLogger.matchEvents([
					{
						eventName: "A",
						category: "error",
						message: "genericError",
						errorType: FluidErrorTypes.genericError,
						error: "genericError",
					},
				]),
			);
		});
	});

	describe("Send and receive DataCorruptionError instances", () => {
		it("Send and receive a DataCorruptionError.", () => {
			const testError = new DataCorruptionError("dataCorruptionError", {
				clientId: "clientId",
				sequenceNumber: 0,
				message1: "message1",
				message2: "message2",
				exampleExtraTelemetryProp: "exampleExtraTelemetryProp",
			});
			mockLogger.toTelemetryLogger().sendErrorEvent({ eventName: "A" }, testError);
			assert(
				mockLogger.matchEvents([
					{
						eventName: "A",
						category: "error",
						message: "dataCorruptionError",
						errorType: FluidErrorTypes.dataCorruptionError,
						error: "dataCorruptionError",
						clientId: "clientId",
						sequenceNumber: 0,
						message1: "message1",
						message2: "message2",
						exampleExtraTelemetryProp: "exampleExtraTelemetryProp",
						dataProcessingError: 1,
					},
				]),
			);
		});
	});

	describe("Send errors using a logger from createChildLogger", () => {
		it("Send and receive a GenericError.", () => {
			const childLogger = createChildLogger({
				logger: mockLogger,
				namespace: "errorTypeTestNamespace",
			});
			const testError = new GenericError("genericError");
			childLogger.sendErrorEvent({ eventName: "A" }, testError);
			assert(
				mockLogger.matchEvents([
					{
						eventName: "errorTypeTestNamespace:A",
						category: "error",
						message: "genericError",
						errorType: FluidErrorTypes.genericError,
						error: "genericError",
					},
				]),
			);
		});
	});
});

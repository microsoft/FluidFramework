/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/test-runtime-utils";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { GenericError, DataCorruptionError, CreateContainerError } from "../error";

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
            mockLogger.sendErrorEvent({ eventName: "A" }, testError);
            assert(mockLogger.matchEvents([{
                eventName: "A",
                category: "error",
                message: "genericError",
                errorType: ContainerErrorType.genericError,
                error: "genericError",
            }]));
        });

        // Dangling error objects of any type will be ignored (see constructor):
        it("Send and receive a GenericError with a dangling error of any type.", () => {
            const testError = new GenericError("genericError", "placeholder");
            mockLogger.sendErrorEvent({ eventName: "A" }, testError);
            assert(mockLogger.matchEvents([{
                eventName: "A",
                category: "error",
                message: "genericError",
                errorType: ContainerErrorType.genericError,
                error: "genericError",
            }]));
        });
        it("Send and receive a GenericError with a dangling error of object type.", () => {
            const testErrorObj = new Error("some error");
            const testError = new GenericError("genericError", testErrorObj);
            mockLogger.sendErrorEvent({ eventName: "A" }, testError);
            assert(mockLogger.matchEvents([{
                eventName: "A",
                category: "error",
                message: "genericError",
                errorType: ContainerErrorType.genericError,
                error: "genericError",
            }]));
        });

        it("Send and receive a GenericError using CreateContainerError", () => {
            const props = {
                clientId: "clientId",
                messageClientId: "messageClientId",
                sequenceNumber: 0,
                clientSequenceNumber: 0,
                messageTimestamp: 0,
            };
            const testError = new GenericError(
                "someGenericError",
                undefined /* error */,
                props,
            );
            // Equivalent of common scenario where we call container.close(CreateContainerError(some_error)):
            const wrappedTestError = CreateContainerError(testError);
            mockLogger.sendErrorEvent({
                eventName: "containerErrorFromGenericErrorTest",
                sequenceNumber: 0,
            }, wrappedTestError);

            assert(mockLogger.matchEvents([{
                eventName: "containerErrorFromGenericErrorTest",
                category: "error",
                message: "someGenericError",
                errorType: ContainerErrorType.genericError,
                error: "someGenericError",
                clientId: "clientId",
                messageClientId: "messageClientId",
                sequenceNumber: 0,
                clientSequenceNumber: 0,
                messageTimestamp: 0,
            }]));
        });
    });

    describe("Send and receive DataCorruptionError instances", () => {
        it("Send and receive a DataCorruptionError.", () => {
            const testError = new DataCorruptionError(
                "dataCorruptionError",
                {
                    clientId: "clientId",
                    sequenceNumber: 0,
                    message1: "message1",
                    message2: "message2",
                    exampleExtraTelemetryProp: "exampleExtraTelemetryProp",
                },
            );
            mockLogger.sendErrorEvent({ eventName: "A" }, testError);
            assert(mockLogger.matchEvents([{
                eventName: "A",
                category: "error",
                message: "dataCorruptionError",
                errorType: ContainerErrorType.dataCorruptionError,
                error: "dataCorruptionError",
                clientId: "clientId",
                sequenceNumber: 0,
                message1: "message1",
                message2: "message2",
                exampleExtraTelemetryProp: "exampleExtraTelemetryProp",
            }]));
        });
    });

    describe("Send errors using a ChildLogger", () => {
        it("Send and receive a GenericError.", () => {
            const childLogger = ChildLogger.create(mockLogger, "errorTypeTestNamespace");
            const testError = new GenericError("genericError");
            childLogger.sendErrorEvent({ eventName: "A" }, testError);
            assert(mockLogger.matchEvents([{
                eventName: "errorTypeTestNamespace:A",
                category: "error",
                message: "genericError",
                errorType: ContainerErrorType.genericError,
                error: "genericError",
            }]));
        });

        it("Send and receive a DataCorruptionError using CreateContainerError", () => {
            const childLogger = ChildLogger.create(mockLogger, "errorTypeTestNamespace");
            // Example dataCorruptionError kicked up by some process:
            const testError = new DataCorruptionError(
                "dataCorruptionErrorTest",
                { exampleExtraTelemetryProp: "exampleExtraTelemetryProp" },
            );
            // Equivalent of common scenario where we call container.close(CreateContainerError(some_error)):
            const wrappedTestError = CreateContainerError(testError);
            childLogger.sendErrorEvent({
                eventName: "CloseContainerOnDataCorruptionTest",
                sequenceNumber: 0,
            }, wrappedTestError);

            assert(mockLogger.matchEvents([{
                eventName: "errorTypeTestNamespace:CloseContainerOnDataCorruptionTest",
                category: "error",
                message: "dataCorruptionErrorTest",
                errorType: ContainerErrorType.dataCorruptionError,
                error: "dataCorruptionErrorTest",
                exampleExtraTelemetryProp: "exampleExtraTelemetryProp",
                sequenceNumber: 0,
            }]));
        });
    });
});

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerErrorType,
    IGenericError,
    // ICriticalContainerError,
    // IErrorBase,
} from "@fluidframework/container-definitions";
import { MockLogger } from "../mockLogger";

 /**
  * A set of tests to make sure that the value of "errorType" field is not lost in telemetry through all the various
  * ways the FluidFramework codebase creates and sends errors.
  *
  * As of 0.21, there is no single ErrorType enum - it has been broken into several enums that each may also have
  * sibling types. This test suite aims to be exhaustive.
  *
  * TODO: Consider breaking apart into multiple test files?
  * TODO: Some tests below are actually of type aliases - kept here for completeness and in case those types become
  * extensions or otherwise not-just-aliases in the future.
  */
describe("Check if the errorType field matches after sending/receiving via telemetry. Breakdown by area.", () => {
    describe("Container errors", () => {
        let mockLogger: MockLogger;
        beforeEach(() => {
            mockLogger = new MockLogger();
        });

        it("Send and receive a genericError", () => {
            const testError: IGenericError = {
                errorType: ContainerErrorType.genericError,
                message: "genericError test",
            };
            mockLogger.sendErrorEvent({ eventName: "A" }, testError);
            assert(mockLogger.matchEvents([{
                eventName: "A",
                category: "error",
                error: "genericError test",
                errorType: ContainerErrorType.genericError,
                message: "genericError test",
            }]));
        });
//        describe("Test errorType passing via ContainerErrorType")
   });
});

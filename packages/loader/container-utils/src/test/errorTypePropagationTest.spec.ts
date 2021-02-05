import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/test-runtime-utils";
import {
     ContainerErrorType,
//     // ICriticalContainerError,
//     // IErrorBase,
} from "@fluidframework/container-definitions";
import { GenericError, /* DataCorruptionError, CreateContainerError */} from "../error";

describe("Check if the errorType field matches after sending/receiving via Container error classes", () => {
    describe("Send and receive GenericError instances", () => {
        let mockLogger: MockLogger;
        beforeEach(() => {
            mockLogger = new MockLogger();
        });

        it("Send and receive a GenericError with no attached error.", () => {
            const testError = new GenericError("genericError", undefined);
            mockLogger.sendErrorEvent({ eventName: "A" }, testError);
            assert(mockLogger.matchEvents([{
                eventName: "A",
                category: "error",
                errorType: ContainerErrorType.genericError,
            }]));
        });
   });
});

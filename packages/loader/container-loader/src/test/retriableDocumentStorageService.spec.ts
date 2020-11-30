/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverErrorType, IDocumentStorageService } from "@fluidframework/driver-definitions";
import { RetriableDocumentStorageService } from "../retriableDocumentStorageService";

describe("RetriableDocumentStorageService Tests", () => {
    let retriableStorageService: RetriableDocumentStorageService;
    let internalService: IDocumentStorageService;
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        internalService = {} as IDocumentStorageService;
        const container = {
            cancelDelayInfo: () => {},
            emitDelayInfo: () => undefined,
        };
        retriableStorageService = new RetriableDocumentStorageService(internalService, container);
    });

    it("Should succeed at first time", async () => {
        let retryTimes: number = 1;
        let success = "false";
        internalService.read = async (id: string) => {
            retryTimes -= 1;
            return "true";
        };
        success = await retriableStorageService.read("");
        assert.strictEqual(retryTimes, 0, "Should succeed at first time");
        assert.strictEqual(success, "true", "Retry shoul succeed ultimately");
    });

    it("Check that it retries infinitely", async () => {
        let retryTimes: number = 5;
        let success = "false";
        internalService.read = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throw error");
                (error as any).retryAfterSeconds = 10;
                throw error;
            }
            return "true";
        };
        success = await retriableStorageService.read("");
        assert.strictEqual(retryTimes, 0, "Should keep retrying until success");
        assert.strictEqual(success, "true", "Retry shoul succeed ultimately");
    });

    it("Check that it retries after retry seconds", async () => {
        let retryTimes: number = 1;
        let success = "false";
        let timerFinished = false;
        setTimeout(() => {
            timerFinished = true;
        }, 200);
        internalService.read = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throttle Error");
                (error as any).errorType = DriverErrorType.throttlingError;
                (error as any).retryAfterSeconds = 400;
                (error as any).canRetry = true;
                throw error;
            }
            return "true";
        };
        success = await retriableStorageService.read("");
        assert.strictEqual(timerFinished, true, "Timer should be destroyed");
        assert.strictEqual(retryTimes, 0, "Should retry once");
        assert.strictEqual(success, "true", "Retry shoul succeed ultimately");
    });

    it("If error is just a string, should retry as canRetry is not false", async () => {
        let retryTimes: number = 1;
        let success = "false";
        internalService.read = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                // eslint-disable-next-line no-throw-literal
                throw "error";
            }
            return "true";
        };
        try {
            success = await retriableStorageService.read("");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should retry");
        assert.strictEqual(success, "true", "Should succeed as retry should be successful");
    });

    it("Should not retry if canRetry is set as false", async () => {
        let retryTimes: number = 1;
        let success = "false";
        internalService.read = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                (error as any).canRetry = false;
                throw error;
            }
            return "true";
        };
        try {
            success = await retriableStorageService.read("");
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, "false", "Should not succeed as canRetry was not set");
    });

    it("Should not retry if it is disabled", async () => {
        let retryTimes: number = 1;
        let success = "false";
        retriableStorageService.dispose();
        internalService.read = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                (error as any).canRetry = true;
                throw error;
            }
            return "true";
        };
        try {
            success = await retriableStorageService.read("");
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, "false", "Should not succeed as retrying was disabled");
    });
});

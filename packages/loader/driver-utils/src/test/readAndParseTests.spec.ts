/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { readWithRetry } from "../readAndParse";

describe("Read and parse Tests", () => {
    it("Should succeed at first time", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            retryTimes -= 1;
            return true;
        };
        success = await readWithRetry(api);
        assert.strictEqual(retryTimes, 0, "Should succeed at first time");
        assert.strictEqual(success, true, "Retry shoul succeed ultimately");
    });

    it("Check that it retries infinitely", async () => {
        let retryTimes: number = 5;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throw error");
                (error as any).canRetry = true;
                throw error;
            }
            return true;
        };
        success = await readWithRetry(api);
        assert.strictEqual(retryTimes, 0, "Should keep retrying until success");
        assert.strictEqual(success, true, "Retry shoul succeed ultimately");
    });

    it("Check that it retries after retry seconds", async () => {
        let retryTimes: number = 1;
        let success = false;
        let timerFinished = false;
        setTimeout(() => {
            timerFinished = true;
        }, 250);
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throttle Error");
                (error as any).errorType = DriverErrorType.throttlingError;
                (error as any).retryAfterSeconds = 500;
                (error as any).canRetry = true;
                throw error;
            }
            return true;
        };
        success = await readWithRetry(api);
        assert.strictEqual(timerFinished, true, "Timer should be destroyed");
        assert.strictEqual(retryTimes, 0, "Should retry once");
        assert.strictEqual(success, true, "Retry shoul succeed ultimately");
    });

    it("If error is just a string, don't retry", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                // eslint-disable-next-line no-throw-literal
                throw "error";
            }
            return true;
        };
        try {
            success = await readWithRetry(api);
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, false, "Should not succeed as error was not an object");
    });

    it("Should not retry if canRetry is set as false", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                throw new Error("error");
            }
            return true;
        };
        try {
            success = await readWithRetry(api);
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, false, "Should not succeed as canRetry was not set");
    });
});

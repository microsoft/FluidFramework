/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { runWithRetry } from "../runWithRetry";

const _setTimeout = global.setTimeout;
const fastSetTimeout: any =
    (callback: (...cbArgs: any[]) => void, ms: number, ...args: any[]) => _setTimeout(callback, ms / 1000.0, ...args);
async function  runWithFastSetTimeout<T>(callback: () => Promise<T>): Promise<T> {
    global.setTimeout = fastSetTimeout;
    return callback().finally(()=>{
        global.setTimeout = _setTimeout;
    });
}

describe("runWithRetry Tests", () => {
    const voidRefreshDelayInfo = () => {};
    const voidEmitDelayInfo = () => {};

    const logger = new TelemetryNullLogger();

    it("Should succeed at first time", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            retryTimes -= 1;
            return true;
        };

        let refreshDelayInfoTimes: number = 0;
        let emitDelayInfoTimes: number = 0;
        success = await runWithFastSetTimeout(async () => runWithRetry(
            api,
            "test",
            () => { refreshDelayInfoTimes += 1; },
            () => { emitDelayInfoTimes += 1; },
            logger));
        assert.strictEqual(retryTimes, 0, "Should succeed at first time");
        assert.strictEqual(success, true, "Retry should succeed ultimately");
        assert.strictEqual(refreshDelayInfoTimes, 0, "Should not refresh delay at first time");
        assert.strictEqual(emitDelayInfoTimes, 0, "Should not emit delay at first time");
    });

    it("Check that it retries infinitely", async () => {
        const maxTries: number = 5;
        let retryTimes: number = maxTries;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throw error");
                (error as any).retryAfterSeconds = 10;
                (error as any).canRetry = true;
                throw error;
            }
            return true;
        };

        let refreshDelayInfoTimes: number = 0;
        let emitDelayInfoTimes: number = 0;
        success = await runWithFastSetTimeout(async () => runWithRetry(
            api,
            "test",
            () => { refreshDelayInfoTimes += 1; },
            () => { emitDelayInfoTimes += 1; },
            logger));
        assert.strictEqual(retryTimes, 0, "Should keep retrying until success");
        assert.strictEqual(success, true, "Retry should succeed ultimately");
        assert.strictEqual(refreshDelayInfoTimes, 1, "Should refresh delay once");
        assert.strictEqual(emitDelayInfoTimes, maxTries, "Should emit delay at each try");
    });

    it("Check that it retries after retry seconds", async () => {
        let retryTimes: number = 1;
        let success = false;
        let timerFinished = false;
        setTimeout(() => {
            timerFinished = true;
        }, 200);
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throttle Error");
                (error as any).errorType = DriverErrorType.throttlingError;
                (error as any).retryAfterSeconds = 400;
                (error as any).canRetry = true;
                throw error;
            }
            return true;
        };
        success = await runWithFastSetTimeout(
            async () => runWithRetry(api, "test", voidRefreshDelayInfo, voidEmitDelayInfo, logger));
        assert.strictEqual(timerFinished, true, "Timer should be destroyed");
        assert.strictEqual(retryTimes, 0, "Should retry once");
        assert.strictEqual(success, true, "Retry should succeed ultimately");
    });

    it("If error is just a string, should retry as canRetry is not false", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const err = new Error("error");
                (err as any).canRetry = true;
                throw err;
            }
            return true;
        };
        try {
            success = await runWithFastSetTimeout(
                async () => runWithRetry(api, "test", voidRefreshDelayInfo, voidEmitDelayInfo, logger));
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should retry");
        assert.strictEqual(success, true, "Should succeed as retry should be successful");
    });

    it("Should not retry if canRetry is set as false", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                (error as any).canRetry = false;
                throw error;
            }
            return true;
        };
        try {
            success = await runWithFastSetTimeout(
                async () => runWithRetry(api, "test", voidRefreshDelayInfo, voidEmitDelayInfo, logger));
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, false, "Should not succeed as canRetry was not set");
    });

    it("Should not retry if canRetry is not set", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                throw error;
            }
            return true;
        };
        try {
            success = await runWithFastSetTimeout(
                async () => runWithRetry(api, "test", voidRefreshDelayInfo, voidEmitDelayInfo, logger));
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, false, "Should not succeed as canRetry was not set");
    });

    it("Should not retry if it is disabled", async () => {
        let retryTimes: number = 1;
        let success = false;
        const api = async () => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                (error as any).canRetry = true;
                throw error;
            }
            return true;
        };
        try {
            success = await runWithFastSetTimeout(async ()=> runWithRetry(
                api,
                "test",
                voidRefreshDelayInfo,
                voidEmitDelayInfo,
                logger,
                () => {
                    return { retry: false, error: "disposed"};
                },
            ));
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, false, "Should not succeed as retrying was disabled");
    });
});

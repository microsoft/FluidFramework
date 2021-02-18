/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverErrorType, IDocumentStorageService } from "@fluidframework/driver-definitions";
import { IsoBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { RetriableDocumentStorageService } from "../retriableDocumentStorageService";

describe("RetriableDocumentStorageService Tests", () => {
    let retriableStorageService: RetriableDocumentStorageService;
    let internalService: IDocumentStorageService;
    const iso_true = IsoBuffer.from("true").buffer;
    const iso_false = IsoBuffer.from("false").buffer;
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        internalService = {} as IDocumentStorageService;
        const deltaManager = {
            refreshDelayInfo: () => {},
            emitDelayInfo: () => {},
        };
        retriableStorageService = new RetriableDocumentStorageService(
            internalService,
            deltaManager,
            new TelemetryNullLogger(),
        );
    });

    it("Should succeed at first time", async () => {
        let retryTimes: number = 1;
        let success = iso_false;
        internalService.readBlob = async (id: string) => {
            retryTimes -= 1;
            return iso_true;
        };
        success = await retriableStorageService.readBlob("");
        assert.strictEqual(retryTimes, 0, "Should succeed at first time");
        assert.strictEqual(success, iso_true, "Retry shoul succeed ultimately");
    });

    it("Check that it retries infinitely", async () => {
        let retryTimes: number = 5;
        let success = iso_false;
        internalService.readBlob = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throw error");
                (error as any).retryAfterSeconds = 10;
                (error as any).canRetry = true;
                throw error;
            }
            return iso_true;
        };
        success = await retriableStorageService.readBlob("");
        assert.strictEqual(retryTimes, 0, "Should keep retrying until success");
        assert.strictEqual(success, iso_true, "Retry shoul succeed ultimately");
    });

    it("Check that it retries after retry seconds", async () => {
        let retryTimes: number = 1;
        let success = iso_false;
        let timerFinished = false;
        setTimeout(() => {
            timerFinished = true;
        }, 200);
        internalService.readBlob = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("Throttle Error");
                (error as any).errorType = DriverErrorType.throttlingError;
                (error as any).retryAfterSeconds = 400;
                (error as any).canRetry = true;
                throw error;
            }
            return iso_true;
        };
        success = await retriableStorageService.readBlob("");
        assert.strictEqual(timerFinished, true, "Timer should be destroyed");
        assert.strictEqual(retryTimes, 0, "Should retry once");
        assert.strictEqual(success, iso_true, "Retry shoul succeed ultimately");
    });

    it("If error is just a string, should retry as canRetry is not false", async () => {
        let retryTimes: number = 1;
        let success = iso_false;
        internalService.readBlob = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const err = new Error("error");
                (err as any).canRetry = true;
                throw err;
            }
            return iso_true;
        };
        try {
            success = await retriableStorageService.readBlob("");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should retry");
        assert.strictEqual(success, iso_true, "Should succeed as retry should be successful");
    });

    it("Should not retry if canRetry is set as false", async () => {
        let retryTimes: number = 1;
        let success = iso_false;
        internalService.readBlob = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                (error as any).canRetry = false;
                throw error;
            }
            return iso_true;
        };
        try {
            success = await retriableStorageService.readBlob("");
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, iso_false, "Should not succeed as canRetry was not set");
    });

    it("Should not retry if canRetry is not set", async () => {
        let retryTimes: number = 1;
        let success = iso_false;
        internalService.readBlob = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                throw error;
            }
            return iso_true;
        };
        try {
            success = await retriableStorageService.readBlob("");
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, iso_false, "Should not succeed as canRetry was not set");
    });

    it("Should not retry if it is disabled", async () => {
        let retryTimes: number = 1;
        let success = iso_false;
        retriableStorageService.dispose();
        internalService.readBlob = async (id: string) => {
            if (retryTimes > 0) {
                retryTimes -= 1;
                const error = new Error("error");
                (error as any).canRetry = true;
                throw error;
            }
            return iso_true;
        };
        try {
            success = await retriableStorageService.readBlob("");
            assert.fail("Should not succeed");
        } catch (error) {}
        assert.strictEqual(retryTimes, 0, "Should not retry");
        assert.strictEqual(success, iso_false, "Should not succeed as retrying was disabled");
    });
});

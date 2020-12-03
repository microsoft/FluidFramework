/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TestThrottlerHelper, TestThrottleStorageManager } from "@fluidframework/server-test-utils";
import { Throttler } from "../throttler";
import { IThrottler } from "@fluidframework/server-services-core";
import Sinon from "sinon";


describe("Throttler", () => {
    // TODO: add assertions for the ThrottlingError being thrown
    // TODO: add tests for variable weight requests
    // TODO: add tests for cache size and age
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers(Date.now());
    });

    afterEach(() => {
        Sinon.restore();
    });

    const exceedThrottleLimit = async (
        id: string,
        throttler: IThrottler,
        rate: number,
        minThrottleCheckInterval: number,
        numIntervalsToBeThrottledFor: number = 1,
    ) => {
        const numRequestsToExceedIntervalLimit = Math.ceil(minThrottleCheckInterval / rate);
        // open enough requests to throttle for duration of numIntervalsToBeThrottledFor
        const numRequestsToOpen = numIntervalsToBeThrottledFor * numRequestsToExceedIntervalLimit;
        for (let i = 0; i < numRequestsToOpen; i++) {
            // make sure we give Throttler ability to check Throttler in case it is doing so
            await Sinon.clock.nextAsync();
            // should not throw because no time has passed to allow Throttler to be checked aside from initial update
            assert.doesNotThrow(() => {
                throttler.openRequest(id);
            });
        }
    }

    it("does not throttle within min throttle check interval", async () => {
        // Max 10 requests per second
        const limit = 10;
        const rate = 100;
        // only checks Throttler at most once per second
        const minThrottleCheckInterval = 1000;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttlerHelper = new TestThrottlerHelper(throttleStorageManager, limit, rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test1";

        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 1);
    });

    it("throttles after min throttle check interval", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttlerHelper = new TestThrottlerHelper(throttleStorageManager, limit, rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test2";

        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 1);

        // move clock forward to next Throttler check
        await Sinon.clock.tickAsync(minThrottleCheckInterval + 1);

        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
        // wait for throttler to be checked
        await Sinon.clock.nextAsync();
        // should throw because last Throttler update should have returned throttled=true
        assert.throws(() => {
            throttler.openRequest(id);
        });
    });

    it("throttles after multiple throttle check intervals", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttlerHelper = new TestThrottlerHelper(throttleStorageManager, limit, rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test3";

        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 2);

        // move clock forward to next Throttler check
        await Sinon.clock.tickAsync(minThrottleCheckInterval * 2 + 1);

        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
        // wait for throttler to be checked
        await Sinon.clock.nextAsync();
        // should throw because last Throttler update should have returned throttled=true
        assert.throws(() => {
            throttler.openRequest(id);
        });
    });

    it("un-throttles early if requests are closed", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttlerHelper = new TestThrottlerHelper(throttleStorageManager, limit, rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test4";

        // open enough requests to throttle for 3 intervals, after throttle interval expires
        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 2);

        // close enough requests to reduce throttle duration by 1 interval
        for (let i = 0; i < limit + 1; i++) {
            throttler.closeRequest(id);
        }

        await Sinon.clock.tickAsync(minThrottleCheckInterval * 2 + 1);
        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
        await Sinon.clock.nextAsync();
        // should not throw because exceeded limit but requests were closed to remain within limit
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
    });

    it("does not throttle when Throttler fails to update throttle status", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttlerHelper = new TestThrottlerHelper(throttleStorageManager, limit, rate);
        Sinon.stub(throttlerHelper, "updateRequestCount").rejects();
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test5";

        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
        await Sinon.clock.nextAsync();
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
    });

    it("does not throttle when Throttler fails to retrieve throttle status", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttlerHelper = new TestThrottlerHelper(throttleStorageManager, limit, rate);
        Sinon.stub(throttlerHelper, "getThrottleStatus").rejects();
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test6";

        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
        await Sinon.clock.nextAsync();
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
    });

    it("leniently throttles an un-cached, throttled request", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttlerHelper = new TestThrottlerHelper(throttleStorageManager, limit, rate);
        Sinon.stub(throttlerHelper, "updateRequestCount").resolves({
            throttleStatus: true,
            throttleReason: "Exceeded count",
            retryAfterInMs: 100,
        });
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test7";

        // should not throw because throttle interval has not passed
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
        // allow throttle status to be updated
        await Sinon.clock.tickAsync(minThrottleCheckInterval * 2 + 1);
        // should not throw because throttle status is being updated in the background
        assert.doesNotThrow(() => {
            throttler.openRequest(id);
        });
        // allow throttle update to complete
        await Sinon.clock.nextAsync();
        // should throw because throttle status has been retrieved and cached
        assert.throws(() => {
            throttler.openRequest(id);
        });
    });
});

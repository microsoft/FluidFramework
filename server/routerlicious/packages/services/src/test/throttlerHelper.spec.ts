/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TestThrottler, TestThrottleManager } from "@fluidframework/server-test-utils";
import { ThrottlerHelper } from "../throttlerHelper";
import { IThrottlerHelper, ThrottlerRequestType } from "@fluidframework/server-services-core";
import Sinon from "sinon";


describe("ThrottlerHelper", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers(Date.now());
    });

    afterEach(() => {
        Sinon.restore();
    });

    const exceedThrottleLimit = async (
        id: string,
        requestType: ThrottlerRequestType,
        throttlerHelper: IThrottlerHelper,
        rate: number,
        minThrottleCheckInterval: number,
        numIntervalsToBeThrottledFor: number = 1,
    ) => {
        const numRequestsToExceedIntervalLimit = Math.ceil(minThrottleCheckInterval / rate);
        // open enough requests to throttle for duration of numIntervalsToBeThrottledFor
        const numRequestsToOpen = numIntervalsToBeThrottledFor * numRequestsToExceedIntervalLimit;
        for (let i = 0; i < numRequestsToOpen; i++) {
            // make sure we give ThrottlerHelper ability to check Throttler in case it is doing so
            await Sinon.clock.nextAsync();
            // should not throw because no time has passed to allow Throttler to be checked aside from initial update
            assert.doesNotThrow(() => {
                throttlerHelper.openRequest(id, requestType);
            });
        }
    }

    it("does not throttle within min throttle check interval", async () => {
        // Max 10 requests per second
        const limit = 10;
        const rate = 100;
        // only checks Throttler at most once per second
        const minThrottleCheckInterval = 1000;
        const throttleManager = new TestThrottleManager();
        const throttler = new TestThrottler(throttleManager, limit, rate);
        const throttlerHelper = new ThrottlerHelper(throttler, minThrottleCheckInterval);
        const id = "test1";
        const requestType = ThrottlerRequestType.AlfredHttps;

        await exceedThrottleLimit(id, requestType, throttlerHelper, rate, minThrottleCheckInterval, 1);
    });

    it("throttles after min throttle check interval", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleManager = new TestThrottleManager();
        const throttler = new TestThrottler(throttleManager, limit, rate);
        const throttlerHelper = new ThrottlerHelper(throttler, minThrottleCheckInterval);
        const id = "test2";
        const requestType = ThrottlerRequestType.AlfredHttps;

        await exceedThrottleLimit(id, requestType, throttlerHelper, rate, minThrottleCheckInterval, 1);

        // move clock forward to next Throttler check
        await Sinon.clock.tickAsync(minThrottleCheckInterval + 1);

        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
        // wait for throttler to be checked
        await Sinon.clock.nextAsync();
        // should throw because last Throttler update should have returned throttled=true
        assert.throws(() => {
            throttlerHelper.openRequest(id, requestType);
        });
    });

    it("throttles after multiple throttle check intervals", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleManager = new TestThrottleManager();
        const throttler = new TestThrottler(throttleManager, limit, rate);
        const throttlerHelper = new ThrottlerHelper(throttler, minThrottleCheckInterval);
        const id = "test3";
        const requestType = ThrottlerRequestType.AlfredHttps;

        await exceedThrottleLimit(id, requestType, throttlerHelper, rate, minThrottleCheckInterval, 2);

        // move clock forward to next Throttler check
        await Sinon.clock.tickAsync(minThrottleCheckInterval * 2 + 1);

        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
        // wait for throttler to be checked
        await Sinon.clock.nextAsync();
        // should throw because last Throttler update should have returned throttled=true
        assert.throws(() => {
            throttlerHelper.openRequest(id, requestType);
        });
    });

    it("un-throttles early if requests are closed", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleManager = new TestThrottleManager();
        const throttler = new TestThrottler(throttleManager, limit, rate);
        const throttlerHelper = new ThrottlerHelper(throttler, minThrottleCheckInterval);
        const id = "test4";
        const requestType = ThrottlerRequestType.AlfredHttps;

        // open enough requests to throttle for 3 intervals, after throttle interval expires
        await exceedThrottleLimit(id, requestType, throttlerHelper, rate, minThrottleCheckInterval, 2);

        // close enough requests to reduce throttle duration by 1 interval
        for (let i = 0; i < limit + 1; i++) {
            throttlerHelper.closeRequest(id, requestType);
        }

        await Sinon.clock.tickAsync(minThrottleCheckInterval * 2 + 1);
        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
        await Sinon.clock.nextAsync();
        // should not throw because exceeded limit but requests were closed to remain within limit
        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
    });

    it("does not throttle when Throttler fails to update throttle status", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleManager = new TestThrottleManager();
        const throttler = new TestThrottler(throttleManager, limit, rate);
        Sinon.stub(throttler, "updateRequestCount").rejects();
        const throttlerHelper = new ThrottlerHelper(throttler, minThrottleCheckInterval);
        const id = "test5";
        const requestType = ThrottlerRequestType.AlfredHttps;

        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
        await Sinon.clock.nextAsync();
        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
    });

    it("does not throttle when Throttler fails to retrieve throttle status", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleManager = new TestThrottleManager();
        const throttler = new TestThrottler(throttleManager, limit, rate);
        Sinon.stub(throttler, "getThrottleStatus").rejects();
        const throttlerHelper = new ThrottlerHelper(throttler, minThrottleCheckInterval);
        const id = "test6";
        const requestType = ThrottlerRequestType.AlfredHttps;

        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
        await Sinon.clock.nextAsync();
        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
    });

    it("leniently throttles an un-cached, throttled request", async () => {
        const limit = 10;
        const rate = 100;
        const minThrottleCheckInterval = 1000;
        const throttleManager = new TestThrottleManager();
        const throttler = new TestThrottler(throttleManager, limit, rate);
        Sinon.stub(throttler, "updateRequestCount").resolves({
            throttleStatus: false,
            throttleReason: undefined,
            retryAfterInMs: 0,
        });
        Sinon.stub(throttler, "getThrottleStatus").resolves({
            throttleStatus: true,
            throttleReason: "Exceeded count",
            retryAfterInMs: 100,
        });
        const throttlerHelper = new ThrottlerHelper(throttler, minThrottleCheckInterval);
        const id = "test7";
        const requestType = ThrottlerRequestType.AlfredHttps;

        // should not throw because throttle status is being retrieved in the background
        assert.doesNotThrow(() => {
            throttlerHelper.openRequest(id, requestType);
        });
        // allow throttle status to be retrieved
        await Sinon.clock.nextAsync();
        // should throw because throttle status has been retrieved and cached
        assert.throws(() => {
            throttlerHelper.openRequest(id, requestType);
        });
    });
});

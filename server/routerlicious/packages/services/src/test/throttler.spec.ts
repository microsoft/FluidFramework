/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TestThrottlerHelper } from "@fluidframework/server-test-utils";
import { Throttler } from "../throttler";
import { IThrottler, ThrottlingError } from "@fluidframework/server-services-core";
import Sinon from "sinon";

describe("Throttler", () => {
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
        weight: number = 1,
    ) => {
        const numOperationsToExceedIntervalLimit = Math.ceil(minThrottleCheckInterval / rate);
        // open enough operations to throttle for duration of numIntervalsToBeThrottledFor
        const numOperations = numIntervalsToBeThrottledFor * numOperationsToExceedIntervalLimit;
        for (let i = 0; i < numOperations + 1; i++) {
            // make sure we give Throttler ability to check Throttler in case it is doing so
            await Sinon.clock.nextAsync();
            // should not throw because no time has passed to allow Throttler to be checked aside from initial update
            assert.doesNotThrow(() => {
                throttler.incrementCount(id, weight);
            });
        }
    }

    it("does not throttle within min throttle check interval", async () => {
        // Max 10 operations per throttle check interval
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test1";

        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 1);
    });

    it("throttles after min throttle check interval", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test2";

        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 1);

        // move clock forward to next Throttler check
        Sinon.clock.tick(minThrottleCheckInterval + 1);

        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
        // wait for throttler to be checked
        await Sinon.clock.nextAsync();
        // should throw because last Throttler update should have returned throttled=true
        assert.throws(() => {
            throttler.incrementCount(id);
        }, ThrottlingError);
    });

    it("throttles after multiple throttle check intervals", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test3";

        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 2);

        // move clock forward to next Throttler check
        Sinon.clock.tick(minThrottleCheckInterval * 2 + 1);

        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
        // wait for throttler to be checked
        await Sinon.clock.nextAsync();
        // should throw because last Throttler update should have returned throttled=true
        assert.throws(() => {
            throttler.incrementCount(id);
        }, ThrottlingError);
    });

    it("throttles fewer heavier operations after min throttle check interval", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test2";

        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 0.5, 2);

        // move clock forward to next Throttler check
        Sinon.clock.tick(minThrottleCheckInterval + 1);

        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
        // wait for throttler to be checked
        await Sinon.clock.nextAsync();
        // should throw because last Throttler update should have returned throttled=true
        assert.throws(() => {
            throttler.incrementCount(id);
        }, ThrottlingError);
    });

    it("un-throttles early if operations are closed", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test4";

        // open enough operations to throttle for 3 intervals, after throttle interval expires
        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 2);

        // close enough operations to reduce throttle duration by 1 interval
        const limit = minThrottleCheckInterval / rate;
        for (let i = 0; i < limit + 1; i++) {
            throttler.decrementCount(id);
        }

        Sinon.clock.tick(minThrottleCheckInterval * 2 + 1);
        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
        await Sinon.clock.nextAsync();
        // should not throw because exceeded limit but operations were closed to remain within limit
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
    });

    it("un-throttles fewer heavier operations early if operations are closed", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test4";

        // open enough operations to throttle for 3 intervals, after throttle interval expires
        await exceedThrottleLimit(id, throttler, rate, minThrottleCheckInterval, 1, 2);

        // close enough operations to reduce throttle duration by 1 interval
        const limit = minThrottleCheckInterval / rate;
        for (let i = 0; i < limit / 2 + 1; i++) {
            throttler.decrementCount(id, 2);
        }

        Sinon.clock.tick(minThrottleCheckInterval * 2 + 1);
        // should not throw because Throttler will be checked in the background
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
        await Sinon.clock.nextAsync();
        // should not throw because exceeded limit but operations were closed to remain within limit
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
    });

    it("does not throttle when Throttler fails to update throttle status", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        Sinon.stub(throttlerHelper, "updateCount").rejects();
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test5";

        assert.doesNotThrow(() => {
            throttler.incrementCount(id);
        });
        await Sinon.clock.nextAsync();
        assert.doesNotThrow(() => {
            throttler.incrementCount(id);
        });
    });

    it("does not throttle when Throttler fails to retrieve throttle status", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        Sinon.stub(throttlerHelper, "getThrottleStatus").rejects();
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test6";

        assert.doesNotThrow(() => {
            throttler.incrementCount(id);
        });
        await Sinon.clock.nextAsync();
        assert.doesNotThrow(() => {
            throttler.incrementCount(id);
        });
    });

    it("leniently throttles an un-cached, throttled operation", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        Sinon.stub(throttlerHelper, "updateCount").resolves({
            throttleStatus: true,
            throttleReason: "Exceeded count",
            retryAfterInMs: 100,
        });
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval);
        const id = "test7";

        // should not throw because throttle interval has not passed
        assert.doesNotThrow(() => {
            throttler.incrementCount(id);
        });
        // allow throttle status to be updated
        Sinon.clock.tick(minThrottleCheckInterval * 2 + 1);
        // should not throw because throttle status is being updated in the background
        assert.doesNotThrow(() => {
            throttler.incrementCount(id, 0);
        });
        // allow throttle update to complete
        await Sinon.clock.nextAsync();
        // should throw because throttle status has been retrieved and cached
        assert.throws(() => {
            throttler.incrementCount(id);
        }, ThrottlingError);
    });

    it("does not cache too many operation ids", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        Sinon.stub(throttlerHelper, "updateCount").resolves({
            throttleStatus: true,
            throttleReason: "Exceeded count",
            retryAfterInMs: 100,
        });
        const cacheSize = 5;
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval, undefined, cacheSize);

        // fill cache with truthy throttle statuses
        for (let i = 0; i < cacheSize; i++) {
            throttler.incrementCount(`test${i}`);
        }

        // allow throttle status to be checked
        Sinon.clock.tick(minThrottleCheckInterval + 1);

        for (let i = 0; i < cacheSize; i++) {
            // should not throw because throttle status being updated in the background
            assert.doesNotThrow(() => {
                throttler.incrementCount(`test${i}`);
            });
        }
        await Sinon.clock.nextAsync();
        for (let i = 0; i < cacheSize; i++) {
            // should throw because throttle status has been updated
            assert.throws(() => {
                throttler.incrementCount(`test${i}`);
            }, ThrottlingError);
        }

        // refill cache
        for (let i = 0; i < cacheSize; i++) {
            throttler.incrementCount(`test${i + cacheSize}`);
        }
        // allow throttle status to be checked
        Sinon.clock.tick(minThrottleCheckInterval + 1);
        for (let i = 0; i < cacheSize; i++) {
            // should not throw because throttle status being updated in the background
            assert.doesNotThrow(() => {
                throttler.incrementCount(`test${i + cacheSize}`);
            });
        }
        await Sinon.clock.nextAsync();
        for (let i = 0; i < cacheSize; i++) {
            // should throw because throttle status has been updated
            assert.throws(() => {
                throttler.incrementCount(`test${i + cacheSize}`);
            }, ThrottlingError);
        }

        // check previously cached values
        for (let i = 0; i < cacheSize; i++) {
            // should not throw because dropped from cache
            assert.doesNotThrow(() => {
                throttler.incrementCount(`test${i}`);
            });
        }
    });

    it("expires old cached values", async () => {
        const rate = 10;
        const minThrottleCheckInterval = 100;
        const throttlerHelper = new TestThrottlerHelper(rate);
        Sinon.stub(throttlerHelper, "updateCount").resolves({
            throttleStatus: true,
            throttleReason: "Exceeded count",
            retryAfterInMs: 100,
        });
        const cacheAge = 5000;
        const throttler = new Throttler(throttlerHelper, minThrottleCheckInterval, undefined, undefined, cacheAge);
        const id = "testCache";

        // setup a cached throttled operation
        await throttler.incrementCount(id);
        Sinon.clock.tick(minThrottleCheckInterval + 1);
        await throttler.incrementCount(id);
        await Sinon.clock.nextAsync();
        assert.throws(() => {
            throttler.incrementCount(id);
        }, ThrottlingError);

        // allow cache value to expire
        Sinon.clock.tick(cacheAge + 1);

        // should not throw because cache was dropped and this must be re-updated
        assert.doesNotThrow(() => {
            throttler.incrementCount(id);
        });
    });
});

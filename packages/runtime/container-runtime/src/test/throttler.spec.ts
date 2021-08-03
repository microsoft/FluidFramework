/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import sinon from "sinon";
import { Throttler } from "../throttler";

describe("Throttler", () => {
    let throttler: Throttler;
    let clock: sinon.SinonFakeTimers;
    before(() => clock = sinon.useFakeTimers());
    after(() => clock.restore());
    afterEach(() => clock.reset());

    function assertAscending(array: readonly number[]) {
        if (array.length < 1) {
            return;
        }
        let prev = array[0];
        for (const item of array) {
            assert(item >= prev, "out of order");
            prev = item;
        }
    }

    function getDelayAndTick(): number {
        const delay = throttler.getDelay();
        clock.tick(delay);
        assert.strictEqual(throttler.latestAttemptTime, Date.now(),
            "getDelayAndTick should yield latestAttemptTime === now");
        assertAscending(throttler.getAttempts());
        return delay;
    }

    describe("Exponential Delay", () => {
        // 60 second delay window. We ignore attempts that are more
        // than 60 seconds ago. We are always subtracting the actual
        // delay time for this window.
        const delayWindowMs = 60 * 1000;

        // 30 second maximum delay. After delays reach this length,
        // subsequent attempts will also use the max delay, unless
        // enough extra time passes between attempts for some of the
        // previous start times to drop off out of the window.
        const maxDelayMs = 30 * 1000;

        // Exponential delay: [prev x 2 + 20] (0ms, 20ms, 60ms, 140ms, etc)
        //  # | calculation                   |   delay   | cumulative delay
        // ---|-------------------------------|-----------|-----------------
        //  1 | (2^0  - 1) x 20 =    0 x 20 = |      0 ms |      0 ms
        //  2 | (2^1  - 1) x 20 =    1 x 20 = |     20 ms |     20 ms
        //  3 | (2^2  - 1) x 20 =    3 x 20 = |     60 ms |     80 ms
        //  4 | (2^3  - 1) x 20 =    7 x 20 = |    140 ms |    220 ms
        //  5 | (2^4  - 1) x 20 =   15 x 20 = |    300 ms |    520 ms
        //  6 | (2^5  - 1) x 20 =   31 x 20 = |    620 ms |  1,140 ms
        //  7 | (2^6  - 1) x 20 =   63 x 20 = |  1,260 ms |  2,400 ms
        //  8 | (2^7  - 1) x 20 =  127 x 20 = |  2,540 ms |  4,940 ms
        //  9 | (2^8  - 1) x 20 =  255 x 20 = |  5,100 ms | 10,040 ms
        // 10 | (2^9  - 1) x 20 =  511 x 20 = | 10,220 ms | 20,260 ms
        // 11 | (2^10 - 1) x 20 = 1023 x 20 = | 20,460 ms | 40,720 ms
        // 12 | (2^11 - 1) x 20 = 2047 x 20 = | 30,000 ms | 70,720 ms (MAX)
        // 13 | (2^11 - 1) x 20 = 2047 x 20 = | 30,000 ms | 70,720 ms (MAX)
        const delayFn = (numAttempts: number) => 20 * (Math.pow(2, numAttempts) - 1);

        beforeEach(() => throttler = new Throttler(delayWindowMs, maxDelayMs, delayFn));

        it("Should initially have zero delay", () => {
            assert.strictEqual(throttler.getDelay(), 0);
        });

        it("Should increase as expected with instant failures", () => {
            const expectedDelays = [
                0, 20, 60, 140, 300, 620, 1260,
                2540, 5100, 10220, 20460, 30000, 30000,
            ];
            for (const expectedDelay of expectedDelays) {
                assert.strictEqual(getDelayAndTick(), expectedDelay);
            }
        });

        it("Should remain zero delay with long pauses between getDelay calls", () => {
            for (let i = 0; i < 5; i++) {
                assert.strictEqual(getDelayAndTick(), 0, `iteration ${i}`);
                clock.tick(delayWindowMs);
            }
            assert.strictEqual(getDelayAndTick(), 0);

            // This time barely keep it in the window, giving a delay.
            clock.tick(delayWindowMs - 1);
            assert.strictEqual(getDelayAndTick(), 20);
        });

        it("Should not increase with long pauses between getDelay calls", () => {
            const oneThirdTicks = Math.floor(delayWindowMs / 3);
            const remainingTicks = delayWindowMs - (2 * oneThirdTicks);

            // Accumulate some attempts first.
            assert.strictEqual(getDelayAndTick(), 0);
            clock.tick(oneThirdTicks);
            assert.strictEqual(getDelayAndTick(), 20);
            clock.tick(oneThirdTicks);
            assert.strictEqual(getDelayAndTick(), 60);
            clock.tick(remainingTicks);

            // Loop through attempts periodically dropping off.
            for (let i = 0; i < 100; i++) {
                assert.strictEqual(getDelayAndTick(), 60, `iteration ${i}`);
                clock.tick(i % 3 === 2 ? remainingTicks : oneThirdTicks);
            }
            assert.strictEqual(getDelayAndTick(), 60);

            // This time fail instantly, giving a later delay.
            assert.strictEqual(getDelayAndTick(), 140);
        });

        it("Should stop increasing number of attempts after max", () => {
            for (let i = 0; i < 11; i++) {
                getDelayAndTick();
                assert.strictEqual(throttler.numAttempts, i + 1, `loop 1; iteration ${i}`);
            }
            for (let i = 0; i < 100; i++) {
                getDelayAndTick();
                assert.strictEqual(throttler.numAttempts, 11, `loop 2; iteration ${i}`);
            }
        });

        it("State should be corrected if delay is bypassed", () => {
            // First 2 attempts are allowed to be instant.
            assert.strictEqual(getDelayAndTick(), 0);
            assert.strictEqual(throttler.getDelay(), 20);

            // This attempt is too soon, since we have not delayed 20ms.
            assert.strictEqual(getDelayAndTick(), 60);
        });
    });
});

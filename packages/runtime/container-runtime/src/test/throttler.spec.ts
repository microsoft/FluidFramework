/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import sinon from "sinon";

import {
	Throttler,
	formExponentialFn,
	formExponentialFnWithAttemptOffset,
	formLinearFn,
} from "../throttler.js";

describe("Throttler", () => {
	let throttler: Throttler;
	let clock: sinon.SinonFakeTimers;
	before(() => {
		clock = sinon.useFakeTimers();
	});
	after(() => clock.restore());
	afterEach(() => clock.reset());

	function assertAscending(array: readonly number[]): void {
		if (array.length === 0) {
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
		assert.strictEqual(
			throttler.latestAttemptTime,
			Date.now(),
			"getDelayAndTick should yield latestAttemptTime === now",
		);
		assertAscending(throttler.getAttempts());
		return delay;
	}

	function runTests({
		message,
		delayWindowMs,
		maxDelayMs,
		delayFn,
		expectedDelays,
	}: {
		message: string;
		delayWindowMs: number;
		maxDelayMs: number;
		delayFn: (numAttempts: number) => number;
		expectedDelays: number[];
	}): void {
		describe(message, () => {
			beforeEach(() => {
				throttler = new Throttler(delayWindowMs, maxDelayMs, delayFn);
			});
			const expectedMaxAttempts = expectedDelays.length;
			const expectedDelayAt = (attempt: number): number =>
				attempt >= expectedMaxAttempts ? maxDelayMs : expectedDelays[attempt];

			it("Should initially have zero delay", () => {
				assert.strictEqual(throttler.getDelay(), 0);
			});

			it("Should increase as expected with instant failures", () => {
				for (const expectedDelay of [
					...expectedDelays,
					maxDelayMs,
					maxDelayMs,
					maxDelayMs,
					maxDelayMs,
				]) {
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
				assert.strictEqual(getDelayAndTick(), expectedDelayAt(1));
			});

			it("Should not increase with long pauses between getDelay calls", () => {
				const oneThirdTicks = Math.floor(delayWindowMs / 3);
				const remainingTicks = delayWindowMs - 2 * oneThirdTicks;

				// Accumulate some attempts first.
				assert.strictEqual(getDelayAndTick(), 0);
				clock.tick(oneThirdTicks);
				assert.strictEqual(getDelayAndTick(), expectedDelayAt(1));
				clock.tick(oneThirdTicks);
				assert.strictEqual(getDelayAndTick(), expectedDelayAt(2));
				clock.tick(remainingTicks);

				// Loop through attempts periodically dropping off.
				for (let i = 0; i < 100; i++) {
					assert.strictEqual(getDelayAndTick(), expectedDelays[2], `iteration ${i}`);
					clock.tick(i % 3 === 2 ? remainingTicks : oneThirdTicks);
				}
				assert.strictEqual(getDelayAndTick(), expectedDelayAt(2));

				// This time fail instantly, giving a later delay.
				assert.strictEqual(getDelayAndTick(), expectedDelayAt(3));
			});

			it("Should stop increasing number of attempts after max", () => {
				for (let i = 0; i < expectedMaxAttempts; i++) {
					getDelayAndTick();
					assert.strictEqual(throttler.numAttempts, i + 1, `loop 1; iteration ${i}`);
				}
				for (let i = 0; i < 100; i++) {
					getDelayAndTick();
					assert.strictEqual(
						throttler.numAttempts,
						expectedMaxAttempts,
						`loop 2; iteration ${i}`,
					);
				}
			});

			it("State should be corrected if delay is bypassed", () => {
				// First 2 attempts are allowed to be instant.
				assert.strictEqual(getDelayAndTick(), 0);
				assert.strictEqual(throttler.getDelay(), expectedDelayAt(1));

				// This attempt is too soon, since we have not delayed 20ms.
				assert.strictEqual(getDelayAndTick(), expectedDelayAt(2));
			});
		});
	}

	runTests({
		message: "Exponential Delay",
		// 60 second delay window. We ignore attempts that are more
		// than 60 seconds ago. We are always subtracting the actual
		// delay time for this window.
		delayWindowMs: 60 * 1000,
		// 30 second maximum delay. After delays reach this length,
		// subsequent attempts will also use the max delay, unless
		// enough extra time passes between attempts for some of the
		// previous start times to drop off out of the window.
		maxDelayMs: 30 * 1000,
		// Exponential delay: [prev x 2 + 20] (0ms, 20ms, 60ms, 140ms, etc)
		// Equivalent reduction with G = 1, F = 0:
		/**
		 * f(n) = C x (B^n - G) + F = C x B^n + (F - C x G) = C x B^n - C
		 */
		delayFn: formExponentialFn({ coefficient: 20, offset: -20 }),
		expectedDelays: [0, 20, 60, 140, 300, 620, 1260, 2540, 5100, 10220, 20460],
	});

	runTests({
		message: "Exponential Delay with attempt offset",
		// 60 second delay window. We ignore attempts that are more
		// than 60 seconds ago. We are always subtracting the actual
		// delay time for this window.
		delayWindowMs: 60 * 1000,
		// 30 second maximum delay. After delays reach this length,
		// subsequent attempts will also use the max delay, unless
		// enough extra time passes between attempts for some of the
		// previous start times to drop off out of the window.
		maxDelayMs: 30 * 1000,
		// Exponential delay: [0, 20, then prev x 2] (0ms, 20ms, 40ms, 80ms, etc)
		//  # | calculation                   |   delay   | cumulative delay
		// ---|-------------------------------|-----------|-----------------
		//  1 | SPECIAL CASE: 0 =    0 x 20 = |      0 ms |      0 ms
		//  2 | 2^( 1 - 1) x 20 =    1 x 20 = |     20 ms |     20 ms
		//  3 | 2^( 2 - 1) x 20 =    2 x 20 = |     40 ms |     60 ms
		//  4 | 2^( 3 - 1) x 20 =    4 x 20 = |     80 ms |    140 ms
		//  5 | 2^( 4 - 1) x 20 =    8 x 20 = |    160 ms |    300 ms
		//  6 | 2^( 5 - 1) x 20 =   16 x 20 = |    320 ms |    620 ms
		//  7 | 2^( 6 - 1) x 20 =   32 x 20 = |    640 ms |  1,260 ms
		//  8 | 2^( 7 - 1) x 20 =   64 x 20 = |  1,280 ms |  2,540 ms
		//  9 | 2^( 8 - 1) x 20 =  128 x 20 = |  2,560 ms |  5,100 ms
		// 10 | 2^( 9 - 1) x 20 =  256 x 20 = |  5,120 ms | 10,220 ms
		// 11 | 2^(10 - 1) x 20 =  512 x 20 = | 10,240 ms | 20,460 ms
		// 12 | 2^(11 - 1) x 20 = 1024 x 20 = | 20,480 ms | 40,940 ms
		// 13 | 2^(12 - 1) x 20 = 2048 x 20 = | 30,000 ms | 70,940 ms (MAX)
		// 14 | 2^(13 - 1) x 20 = 5096 x 20 = | 30,000 ms |100,940 ms (MAX)
		delayFn: formExponentialFnWithAttemptOffset(-1, {
			coefficient: 20,
			initialDelay: 0,
		}),
		expectedDelays: [0, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480],
	});

	runTests({
		message: "Linear Delay",
		// 60 ms delay window. We ignore attempts that are more
		// than 60 ms ago. We are always subtracting the actual
		// delay time for this window.
		delayWindowMs: 60,
		// 30 ms maximum delay. After delays reach this length,
		// subsequent attempts will also use the max delay, unless
		// enough extra time passes between attempts for some of the
		// previous start times to drop off out of the window.
		maxDelayMs: 30,
		// Linear delay: (0ms, 10ms, 20ms, 30ms, etc)
		//  # | calculation | delay | cumulative delay
		// ---|-------------|-------|-----------------
		//  1 |    10 x 0 = |  0 ms |  0 ms
		//  2 |    10 x 1 = | 10 ms | 10 ms
		//  3 |    10 x 2 = | 20 ms | 30 ms
		//  4 |    10 x 3 = | 30 ms | 60 ms (MAX)
		//  5 |    10 x 4 = | 30 ms | 90 ms (MAX)
		delayFn: formLinearFn({ coefficient: 10 }),
		expectedDelays: [0, 10, 20],
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import process from "process";

import { SinonFakeTimers, SinonSandbox, SinonSpy, useFakeTimers, createSandbox } from "sinon";

import { PromiseTimer, Timer, IPromiseTimerResult } from "../..";

const flushPromises = async (): Promise<void> =>
	new Promise((resolve) => process.nextTick(resolve));
type PromiseTimerResultString = IPromiseTimerResult["timerResult"];

describe("Timers", () => {
	let clock: SinonFakeTimers;
	let sandbox: SinonSandbox;
	let timeoutSpy: SinonSpy;

	before(() => {
		clock = useFakeTimers();
		sandbox = createSandbox();
	});

	beforeEach("createTimeoutSpy", () => {
		timeoutSpy = sandbox.spy(global, "setTimeout");
	});

	afterEach(() => {
		clock.reset();
		sandbox.restore();
	});

	after(() => {
		clock.restore();
	});

	describe("Timer", () => {
		let runCount = 0;
		const defaultTimeout = 1000;
		const defaultHandler = (): number => runCount++;
		let timer: Timer;

		beforeEach("createTimer", () => {
			runCount = 0;
			timer = new Timer(defaultTimeout, defaultHandler);
		});

		afterEach(() => {
			timer.clear();
		});

		const assertShouldNotRunYet = (
			initialRunCount = 0,
			getRunCount = (): number => runCount,
		): void => {
			assert.strictEqual(getRunCount(), initialRunCount, "Should not run yet");
		};

		const assertShouldNotRunAgainAfterRestart = (): void => {
			// Make sure only executes once
			clock.tick(defaultTimeout + 1);
			assert.strictEqual(runCount, 1, "Should not run additional times after restart");
		};

		const testExactTimeout = (time: number, getRunCount = (): number => runCount): void => {
			const initialRunCount = getRunCount();
			clock.tick(time - 1);
			assertShouldNotRunYet(initialRunCount, getRunCount);
			clock.tick(1);
			assert.strictEqual(getRunCount(), initialRunCount + 1, "Should run exactly once");
		};

		it("Should timeout at default time", () => {
			timer.start();
			testExactTimeout(defaultTimeout);
		});

		it("Should timeout at extremely long time", () => {
			const overrideTimeout = 365 * 24 * 60 * 60 * 1000; // 1 year
			timer.start(overrideTimeout);
			testExactTimeout(overrideTimeout);
		});

		it("Should timeout at longer explicit time", () => {
			const overrideTimeout = defaultTimeout * 2;
			timer.start(overrideTimeout);
			testExactTimeout(overrideTimeout);
		});

		it("Should timeout at shorter explicit time", () => {
			const overrideTimeout = defaultTimeout - 10;
			timer.start(overrideTimeout);
			testExactTimeout(overrideTimeout);
		});

		it("Should immediately execute with negative numbers if setTimeout is called", () => {
			const initialRunCount = runCount;
			timer.start(-10);

			clock.tick(defaultTimeout);
			timer.restart(-1);
			clock.tick(defaultTimeout * 2);

			assert.strictEqual(
				runCount,
				initialRunCount + 2,
				"Should have executed immediately because the handler was late",
			);

			const calls = timeoutSpy.getCalls();
			for (const call of calls) {
				assert(
					call.args[1] >= 0,
					"setTimeout should have never been called with a negative number!",
				);
			}
		});

		it("Should immediately execute if the handler is late even accounting for the restart", () => {
			const initialRunCount = runCount;
			timer.start(defaultTimeout);

			// Restart right before we execute the handler.
			clock.tick(defaultTimeout - 1);
			timer.restart();

			// Advance the clock by a lot, that way, we ensure that the
			// first time our timer executes its handler, it is late by design.
			clock.tick(defaultTimeout * 2);

			flushPromises().then(
				() => {},
				() => {
					assert.fail("Promise flushing failed");
				},
			);

			assert.strictEqual(
				runCount,
				initialRunCount + 1,
				"Should have executed immediately because the handler was late",
			);

			const calls = timeoutSpy.getCalls();
			for (const call of calls) {
				assert(
					call.args[1] >= 0,
					"SetLongTimeout should have never been called with a negative number!",
				);
			}
		});

		it("Should be reusable multiple times", () => {
			timer.start();
			testExactTimeout(defaultTimeout);

			const overrideTimeout = defaultTimeout + 10;
			timer.start(overrideTimeout);
			testExactTimeout(overrideTimeout);

			timer.start();
			testExactTimeout(defaultTimeout);
		});

		it("Should clear running timeout", () => {
			timer.start();
			clock.tick(defaultTimeout - 1);
			assertShouldNotRunYet();
			timer.clear();
			clock.tick(1);
			assert.strictEqual(runCount, 0, "Should not run after cleared");

			// Make extra sure
			clock.tick(defaultTimeout + 1);
			assert.strictEqual(runCount, 0, "Should never run after cleared");
		});

		it("Should restart with defaults", () => {
			// Elapse all but 10ms, then restart
			timer.start();
			clock.tick(defaultTimeout - 10);
			assertShouldNotRunYet();

			timer.restart();
			testExactTimeout(defaultTimeout);

			assertShouldNotRunAgainAfterRestart();
		});

		it("Should restart with previously overridden handler", () => {
			let specialRunCount = 0;
			timer.start(undefined, () => specialRunCount++);
			clock.tick(defaultTimeout - 10);
			assertShouldNotRunYet(0, () => specialRunCount);

			timer.restart();
			testExactTimeout(defaultTimeout, () => specialRunCount);
			assert.strictEqual(runCount, 0, "Should not run default handler");
		});

		it("Should restart with explicit handler", () => {
			let specialRunCount = 0;
			timer.start();
			clock.tick(defaultTimeout - 10);
			assertShouldNotRunYet();

			timer.restart(undefined, () => specialRunCount++);
			testExactTimeout(defaultTimeout, () => specialRunCount);
			assert.strictEqual(runCount, 0, "Should not run default handler");
		});

		it("Should restart with override time > remaining time", () => {
			// Test: restart duration (15) > remaining time (10)
			const restartTimeout = 15;
			timer.start();
			clock.tick(defaultTimeout - 10);
			assertShouldNotRunYet();

			timer.restart(restartTimeout);
			testExactTimeout(restartTimeout);

			assertShouldNotRunAgainAfterRestart();
		});

		it("Should restart with override time < remaining time", () => {
			// Test: restart duration (5) < remaining time (10)
			const restartTimeout = 5;
			timer.start();
			clock.tick(defaultTimeout - 10);
			assertShouldNotRunYet();

			timer.restart(restartTimeout);
			testExactTimeout(restartTimeout);

			assertShouldNotRunAgainAfterRestart();
		});

		it("Should handle consecutive restarts", () => {
			timer.start();
			clock.tick(defaultTimeout - 10);
			assertShouldNotRunYet();

			// 10 ms remaining
			timer.restart();
			clock.tick(defaultTimeout - 5);
			assertShouldNotRunYet();

			// 5 ms remaining
			timer.restart();
			clock.tick(defaultTimeout - 2);
			assertShouldNotRunYet();

			// 2 ms remaining
			timer.restart();
			clock.tick(defaultTimeout - 1);
			assertShouldNotRunYet();

			// 1 ms remaining
			timer.restart();
			testExactTimeout(defaultTimeout);

			// 0 ms remaining; should behave as regular start now
			timer.restart();
			testExactTimeout(defaultTimeout);
		});

		it("Should use override handler of latest restart by default", () => {
			let specialRunCount = 0;
			timer.start();
			clock.tick(defaultTimeout - 10);
			assertShouldNotRunYet();

			// Override handler for restart
			timer.restart(undefined, () => specialRunCount++);
			clock.tick(5); // Make sure < 10 ms passes for test
			assertShouldNotRunYet();
			assertShouldNotRunYet(0, () => specialRunCount);

			// Now subsequent restart should use previous restart handler
			timer.restart();
			testExactTimeout(defaultTimeout, () => specialRunCount);
			assert.strictEqual(runCount, 0, "Should not run default handler");
		});
	});

	describe("PromiseTimer", () => {
		let runCount = 0;
		let resolveResult: PromiseTimerResultString | undefined;
		const defaultTimeout = 1000;
		const defaultHandler = (): number => runCount++;
		let timer: PromiseTimer;

		beforeEach("createTimer", () => {
			runCount = 0;
			resolveResult = undefined;
			timer = new PromiseTimer(defaultTimeout, defaultHandler);
		});

		afterEach(() => {
			timer.clear();
		});

		function startWithThen(ms?: number, handler?: () => void): void {
			timer.start(ms, handler).then(
				(result) => {
					resolveResult = result.timerResult;
				},
				(error) => assert.fail(error),
			);
		}

		async function tickAndFlush(ms: number): Promise<void> {
			clock.tick(ms);
			await flushPromises();
		}

		const assertShouldNotRunYet = (
			initialRunCount = 0,
			getRunCount = (): number => runCount,
		): void => {
			assert.strictEqual(getRunCount(), initialRunCount, "Should not run yet");
			assert.strictEqual(resolveResult, undefined, "Run promise should not be resolved yet");
		};

		const testExactTimeout = async (time: number): Promise<void> => {
			const initialRunCount = runCount;
			await tickAndFlush(time - 1);
			assertShouldNotRunYet(initialRunCount);
			await tickAndFlush(1);
			assert.strictEqual(runCount, initialRunCount + 1, "Should run exactly once");
			assert(resolveResult === "timeout", "Run promise should be resolved");
		};

		it("Should timeout at default time and resolve", async () => {
			startWithThen();
			await testExactTimeout(defaultTimeout);
		});

		it("Should timeout at longer explicit timeout and resolve", async () => {
			const overrideTimeout = defaultTimeout * 2;
			startWithThen(overrideTimeout);

			await testExactTimeout(overrideTimeout);
		});

		it("Should timeout at shorter explicit timeout and resolve", async () => {
			const overrideTimeout = defaultTimeout - 10;
			startWithThen(overrideTimeout);

			await testExactTimeout(overrideTimeout);
		});

		it("Should clear running timeout and resolve as canceled", async () => {
			startWithThen();
			await tickAndFlush(defaultTimeout - 1);
			assertShouldNotRunYet();

			timer.clear();
			await flushPromises();
			assert(resolveResult === "cancel", "Run promise should be resolved as cancel");

			await tickAndFlush(1);
			assert.strictEqual(runCount, 0, "Should not run after cleared");

			// Make extra sure
			await tickAndFlush(defaultTimeout + 1);
			assert.strictEqual(runCount, 0, "Should never run after cleared");
		});
	});
});

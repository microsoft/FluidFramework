/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LogLevel, type ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import sinon from "sinon";

import { PerformanceEvent, TelemetryLogger } from "../logger.js";
import type { TelemetryLoggerExt } from "../telemetryTypes.js";

class MockLogger extends TelemetryLogger implements TelemetryLoggerExt {
	public errorsLogged: number = 0;
	public eventsLogged: number = 0;
	public readonly events: ITelemetryBaseEvent[] = [];
	public readonly logLevels: (LogLevel | undefined)[] = [];

	public constructor() {
		super();
	}

	public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
		if (event.category === "error") {
			++this.errorsLogged;
		}

		++this.eventsLogged;
		this.events.push(event);
		this.logLevels.push(logLevel);
	}
}

describe("PerformanceEvent", () => {
	let logger: MockLogger;
	let callbackCalls = 0;

	const callback = (): void => {
		callbackCalls++;
	};
	const asyncCallback = async (event: PerformanceEvent): Promise<string | void> => {
		const outerPromise = new Promise<string>((resolve, reject) => {
			Promise.resolve("A")
				.finally(() => {
					reject(new Error("B"));
				})
				.then((val) => {
					event.end({ val });
					resolve("C");
				})
				.catch(() => {});
		});

		callbackCalls++;
		return outerPromise.catch(() => {});
	};

	beforeEach(() => {
		callbackCalls = 0;
		logger = new MockLogger();
	});

	it("Cancel then End", async () => {
		await PerformanceEvent.timedExecAsync(logger, { eventName: "Testing" }, asyncCallback, {
			start: true,
			end: true,
			cancel: "generic",
		});
		assert.equal(logger.errorsLogged, 0, "Shouldn't have logged any errors");
	});

	it("Cancel then throw (double cancel)", async () => {
		assert.throws(
			() =>
				PerformanceEvent.timedExec(
					logger,
					{ eventName: "Testing" },
					(event) => {
						callbackCalls++;

						// This is how you can use custom logic to override the "error" category for cancel (specified in the markers below)
						event.cancel({ category: "generic" });
						throw new Error("Cancelled already");
					},
					{
						start: true,
						end: true,
						cancel: "error",
					},
				),
			(e: Error) => e.message === "Cancelled already",
			"Should have thrown the error",
		);
		assert.equal(logger.errorsLogged, 0, "Shouldn't have logged any errors");
		assert.equal(
			logger.eventsLogged,
			2,
			"Should have logged a start and cancel event (not with error category)",
		);
	});

	// Firefox can throw from User Timing APIs after a window is torn down. These diagnostic
	// failures must neither prevent the callback from running nor replace its result or error.
	// Start and completion failures are tested separately for synchronous and asynchronous
	// wrappers, plus end() called inside the callback. Each scenario varies only the failing API.
	// Separate window stubs simulate the failures without replacing the duration clock.
	describe("Browser profiling failures preserve operation outcomes", () => {
		let originalWindow: PropertyDescriptor | undefined;
		let browserWindow: { performance?: unknown };
		let mark: sinon.SinonStub;
		let measure: sinon.SinonStub;
		const timingError = new Error("Browser timing is unavailable");

		beforeEach(() => {
			originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
			mark = sinon.stub();
			measure = sinon.stub();
			// Keep browser User Timing separate from the global duration clock.
			browserWindow = { performance: { mark, measure } };
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: browserWindow,
			});
		});

		afterEach(() => {
			if (originalWindow === undefined) {
				Reflect.deleteProperty(globalThis, "window");
			} else {
				Object.defineProperty(globalThis, "window", originalWindow);
			}
		});

		const makeUnavailable = (api: "getter" | "mark" | "measure"): void => {
			if (api === "getter") {
				Object.defineProperty(browserWindow, "performance", {
					configurable: true,
					get: () => {
						throw timingError;
					},
				});
			} else if (api === "mark") {
				mark.throws(timingError);
			} else {
				measure.throws(timingError);
			}
		};

		const restoreBrowserTiming = (): void => {
			// Expose any incorrect completion attempt using a start mark that was never created.
			Object.defineProperty(browserWindow, "performance", {
				configurable: true,
				value: { mark, measure },
			});
			mark.resetBehavior();
		};

		const assertEndedAndIgnoresLaterLifecycleCalls = (
			event: PerformanceEvent | undefined,
		): void => {
			assert.equal(callbackCalls, 1);
			assert.deepEqual(
				logger.events.map((entry) => entry.eventName),
				["Timing_end"],
			);
			assert.equal(logger.errorsLogged, 0);
			assert.equal(typeof logger.events[0]?.duration, "number");
			assert(event !== undefined);
			assert.equal(
				Reflect.get(event, "startMark"),
				undefined,
				"No pending start mark remains",
			);

			// Later lifecycle calls must not retry browser completion or emit more telemetry.
			const calls = [mark.callCount, measure.callCount];
			event.end();
			event.cancel();
			assert.deepEqual([mark.callCount, measure.callCount], calls);
			assert.equal(logger.eventsLogged, 1);
		};

		const assertCancelled = (): void => {
			assert.equal(callbackCalls, 1);
			assert.deepEqual(
				logger.events.map((event) => event.eventName),
				["Timing_cancel"],
			);
		};

		describe("Browser timing is unavailable before callback execution", () => {
			// Start marking does not call measure(); only the getter and mark() can fail here.
			for (const api of ["getter", "mark"] as const) {
				it(`Preserves the synchronous callback result when the ${api} throws`, () => {
					makeUnavailable(api);
					let capturedEvent: PerformanceEvent | undefined;
					const result = PerformanceEvent.timedExec(
						logger,
						{ eventName: "Timing" },
						(event) => {
							callbackCalls++;
							capturedEvent = event;
							restoreBrowserTiming();
							return 42;
						},
					);

					assert.equal(result, 42);
					assertEndedAndIgnoresLaterLifecycleCalls(capturedEvent);
					// Completion must skip measurement even though the APIs are now healthy.
					sinon.assert.notCalled(measure);
				});

				it(`Preserves the asynchronous callback result when the ${api} throws`, async () => {
					makeUnavailable(api);
					let capturedEvent: PerformanceEvent | undefined;
					const result = await PerformanceEvent.timedExecAsync(
						logger,
						{ eventName: "Timing" },
						async (event) => {
							callbackCalls++;
							capturedEvent = event;
							restoreBrowserTiming();
							return 42;
						},
					);

					assert.equal(result, 42);
					assertEndedAndIgnoresLaterLifecycleCalls(capturedEvent);
					sinon.assert.notCalled(measure);
				});

				it(`Preserves the synchronous callback result with explicit end when the ${api} throws`, () => {
					makeUnavailable(api);
					let capturedEvent: PerformanceEvent | undefined;
					const result = PerformanceEvent.timedExec(
						logger,
						{ eventName: "Timing" },
						(event) => {
							callbackCalls++;
							capturedEvent = event;
							restoreBrowserTiming();
							event.end();
							return 42;
						},
					);

					assert.equal(result, 42);
					assertEndedAndIgnoresLaterLifecycleCalls(capturedEvent);
					sinon.assert.notCalled(measure);
				});

				it(`Preserves the synchronous callback error when the ${api} is unavailable`, () => {
					makeUnavailable(api);
					const callbackError = new Error("Operation failed");
					assert.throws(
						() =>
							PerformanceEvent.timedExec(logger, { eventName: "Timing" }, () => {
								callbackCalls++;
								throw callbackError;
							}),
						(error: unknown) => error === callbackError,
					);
					assertCancelled();
				});

				it(`Preserves the asynchronous callback error when the ${api} is unavailable`, async () => {
					makeUnavailable(api);
					const callbackError = new Error("Operation failed");
					await assert.rejects(
						PerformanceEvent.timedExecAsync(logger, { eventName: "Timing" }, async () => {
							callbackCalls++;
							throw callbackError;
						}),
						(error: unknown) => error === callbackError,
					);
					assertCancelled();
				});
			}
		});

		describe("Browser timing becomes unavailable during callback execution", () => {
			for (const api of ["getter", "mark", "measure"] as const) {
				it(`Preserves the synchronous callback result when the ${api} throws`, () => {
					let capturedEvent: PerformanceEvent | undefined;
					const result = PerformanceEvent.timedExec(
						logger,
						{ eventName: "Timing" },
						(event) => {
							callbackCalls++;
							capturedEvent = event;
							// Simulate teardown after construction, before the wrapper auto-ends.
							makeUnavailable(api);
							return 42;
						},
					);

					assert.equal(result, 42);
					assertEndedAndIgnoresLaterLifecycleCalls(capturedEvent);
				});

				it(`Preserves the asynchronous callback result when the ${api} throws`, async () => {
					let capturedEvent: PerformanceEvent | undefined;
					const result = await PerformanceEvent.timedExecAsync(
						logger,
						{ eventName: "Timing" },
						async (event) => {
							callbackCalls++;
							capturedEvent = event;
							makeUnavailable(api);
							return 42;
						},
					);

					assert.equal(result, 42);
					assertEndedAndIgnoresLaterLifecycleCalls(capturedEvent);
				});

				it(`Preserves the synchronous callback result with explicit end when the ${api} throws`, () => {
					let capturedEvent: PerformanceEvent | undefined;
					const result = PerformanceEvent.timedExec(
						logger,
						{ eventName: "Timing" },
						(event) => {
							callbackCalls++;
							capturedEvent = event;
							makeUnavailable(api);
							// Completion inside the callback must not prevent the following return.
							event.end();
							return 42;
						},
					);

					assert.equal(result, 42);
					assertEndedAndIgnoresLaterLifecycleCalls(capturedEvent);
				});

				it(`Preserves the synchronous callback error when the ${api} is unavailable`, () => {
					const callbackError = new Error("Operation failed");
					assert.throws(
						() =>
							PerformanceEvent.timedExec(logger, { eventName: "Timing" }, () => {
								callbackCalls++;
								makeUnavailable(api);
								throw callbackError;
							}),
						(error: unknown) => error === callbackError,
					);
					assertCancelled();
				});

				it(`Preserves the asynchronous callback error when the ${api} is unavailable`, async () => {
					const callbackError = new Error("Operation failed");
					await assert.rejects(
						PerformanceEvent.timedExecAsync(logger, { eventName: "Timing" }, async () => {
							callbackCalls++;
							makeUnavailable(api);
							throw callbackError;
						}),
						(error: unknown) => error === callbackError,
					);
					assertCancelled();
				});
			}
		});

		it("Keeps healthy marking and explicit end/cancel behavior", () => {
			const ended = PerformanceEvent.start(logger, { eventName: "Ended" });
			ended.end();
			ended.end();
			ended.cancel();
			sinon.assert.calledWithExactly(mark.firstCall, "Ended-start");
			sinon.assert.calledWithExactly(mark.secondCall, "Ended-end");
			sinon.assert.calledOnceWithExactly(measure, "Ended", "Ended-start", "Ended-end");

			PerformanceEvent.timedExec(logger, { eventName: "Cancelled" }, (event) => {
				event.cancel();
				event.end();
			});
			sinon.assert.calledThrice(mark);
			sinon.assert.calledOnce(measure);
			assert.deepEqual(
				logger.events.map((event) => event.eventName),
				["Ended_end", "Cancelled_cancel"],
			);
		});
	});

	describe("Log level escalation", () => {
		it("Logs below-threshold end events at the configured log level", () => {
			const perfEvent = PerformanceEvent.start(
				logger,
				{ eventName: "BelowThreshold" },
				{
					end: true,
					endEventEssentialDurationThresholdMs: Number.MAX_SAFE_INTEGER,
				},
				true,
				LogLevel.info,
			);

			perfEvent.end();

			assert.deepStrictEqual(logger.logLevels, [LogLevel.info]);
			assert.equal(logger.events[0]?.eventName, "BelowThreshold_end");
		});

		it("Logs above-threshold end events as essential", () => {
			const clock = sinon.useFakeTimers();
			try {
				const perfEvent = PerformanceEvent.start(
					logger,
					{ eventName: "AboveThreshold" },
					{
						end: true,
						endEventEssentialDurationThresholdMs: 0,
					},
					true,
					LogLevel.info,
				);

				clock.tick(1);
				perfEvent.end();

				assert.deepStrictEqual(logger.logLevels, [LogLevel.essential]);
				assert.equal(logger.events[0]?.eventName, "AboveThreshold_end");
			} finally {
				clock.restore();
			}
		});

		it("Logs cancel events as essential by default", () => {
			const perfEvent = PerformanceEvent.start(
				logger,
				{ eventName: "EssentialCancel" },
				undefined,
				true,
				LogLevel.info,
			);

			perfEvent.cancel();

			assert.deepStrictEqual(logger.logLevels, [LogLevel.essential]);
			assert.equal(logger.events[0]?.eventName, "EssentialCancel_cancel");
			assert.equal(logger.events[0]?.category, "generic");
		});

		it("Continues to log error-category performance events as essential", () => {
			const perfEvent = PerformanceEvent.start(
				logger,
				{ eventName: "ErrorCategory", category: "error" },
				{
					end: true,
					endEventEssentialDurationThresholdMs: Number.MAX_SAFE_INTEGER,
				},
				true,
				LogLevel.info,
			);

			perfEvent.end();

			assert.deepStrictEqual(logger.logLevels, [LogLevel.essential]);
			assert.equal(logger.events[0]?.eventName, "ErrorCategory_end");
			assert.equal(logger.events[0]?.category, "error");
		});
	});

	describe("Event sampling", () => {
		it("Events are logged at least once", async () => {
			await PerformanceEvent.timedExecAsync(
				logger,
				{ eventName: "TestingAsyncOnce" },
				asyncCallback,
				{ start: true, end: true, cancel: "generic" },
				100, // sampleThreshold
			);

			PerformanceEvent.timedExec(
				logger,
				{ eventName: "TestingSyncOnce" },
				callback,
				{ start: true, end: true, cancel: "generic" },
				100, // sampleThreshold
			);

			assert.equal(callbackCalls, 2);
			assert.equal(logger.eventsLogged, 4);
		});

		it("No sampling by default", async () => {
			await Promise.all(
				Array.from({ length: 100 }).map(async (_) =>
					PerformanceEvent.timedExecAsync(
						logger,
						{ eventName: "TestingAsync" },
						asyncCallback,
						{ start: true, end: true, cancel: "generic" },
					),
				),
			);

			Array.from({ length: 100 }).map((_) =>
				PerformanceEvent.timedExec(logger, { eventName: "TestingSync" }, callback, {
					start: true,
					end: true,
					cancel: "generic",
				}),
			);

			assert.equal(callbackCalls, 200);
			assert.equal(logger.eventsLogged, 200 * 2);
		});

		it("Sampling for async", async () => {
			await Promise.all(
				Array.from({ length: 100 }).map(async (_) =>
					PerformanceEvent.timedExecAsync(
						logger,
						{ eventName: "TestingAsync" },
						asyncCallback,
						{ start: true, end: true, cancel: "generic" },
						20, // sampleThreshold
					),
				),
			);

			assert.equal(callbackCalls, 100);
			assert.equal(
				logger.eventsLogged,
				10,
				"With sampling threshold of 20, expecting 100 calls to produce 10 events (5 start, 5 cancel)",
			);

			// Event with a different category gets logged
			await PerformanceEvent.timedExecAsync(
				logger,
				{ eventName: "TestingAsync", category: "error" },
				asyncCallback,
				{ start: true, end: true, cancel: "generic" },
				20, // sampleThreshold
			);

			assert.equal(callbackCalls, 101);
			assert.equal(logger.eventsLogged, 12, "Expecting two extra events");
		});

		it("Sampling for sync", async () => {
			Array.from({ length: 100 }).map((_) =>
				PerformanceEvent.timedExec(
					logger,
					{ eventName: "TestingSync" },
					callback,
					{ start: true, end: true, cancel: "generic" },
					20, // sampleThreshold
				),
			);

			assert.equal(callbackCalls, 100);
			assert.equal(
				logger.eventsLogged,
				10,
				"With sampling threshold of 20, expecting 100 calls to produce 10 events (5 start, 5 cancel)",
			);

			// Event with a different category gets logged
			PerformanceEvent.timedExec(
				logger,
				{ eventName: "TestingSync", category: "error" },
				callback,
				{ start: true, end: true, cancel: "generic" },
				20, // sampleThreshold
			);

			assert.equal(callbackCalls, 101);
			assert.equal(logger.eventsLogged, 12, "Expecting two extra events");
		});
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import sinon from "sinon";

import { PerformanceEvent, TelemetryLogger } from "../logger.js";
import type { TelemetryLoggerExt } from "../telemetryTypes.js";

class MockLogger extends TelemetryLogger implements TelemetryLoggerExt {
	public errorsLogged: number = 0;
	public eventsLogged: number = 0;

	public constructor() {
		super();
	}

	public send(event: ITelemetryBaseEvent): void {
		if (event.category === "error") {
			++this.errorsLogged;
		}

		++this.eventsLogged;
	}
}

describe("PerformanceEvent", () => {
	let logger: MockLogger;
	let callbackCalls = 0;
	let originalPerformanceDescriptor: PropertyDescriptor | undefined;

	interface TestPerformance {
		readonly markNames: string[];
		readonly measureNames: string[];
		readonly clearedMarkNames: string[];
		readonly clearedMeasureNames: string[];
		mark(name: string): void;
		measure(name: string, startMark: string, endMark: string): void;
		clearMarks(name: string): void;
		clearMeasures(name: string): void;
		now(): number;
	}

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
		originalPerformanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, "performance");
	});

	afterEach(() => {
		if (originalPerformanceDescriptor === undefined) {
			Reflect.deleteProperty(globalThis, "performance");
		} else {
			Object.defineProperty(globalThis, "performance", originalPerformanceDescriptor);
		}
	});

	function installTestPerformance(): TestPerformance {
		const testPerformance: TestPerformance = {
			markNames: [],
			measureNames: [],
			clearedMarkNames: [],
			clearedMeasureNames: [],
			mark(name: string): void {
				this.markNames.push(name);
			},
			measure(name: string, _startMark: string, _endMark: string): void {
				this.measureNames.push(name);
			},
			clearMarks(name: string): void {
				this.clearedMarkNames.push(name);
			},
			clearMeasures(name: string): void {
				this.clearedMeasureNames.push(name);
			},
			now(): number {
				return 0;
			},
		};
		Object.defineProperty(globalThis, "performance", {
			configurable: true,
			value: testPerformance,
		});
		return testPerformance;
	}

	it("Cancel then End", async () => {
		const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			await PerformanceEvent.timedExecAsync(logger, { eventName: "Testing" }, asyncCallback, {
				start: true,
				end: true,
				cancel: "generic",
			});
			assert.equal(logger.errorsLogged, 0, "Shouldn't have logged any errors");
			clock.tick(20_000);
		} finally {
			clock.restore();
		}
	});

	it("Cancel then throw (double cancel)", async () => {
		const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
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
			clock.tick(20_000);
		} finally {
			clock.restore();
		}
	});

	describe("Performance API cleanup", () => {
		it("uses unique Performance API entry names for concurrent events with the same eventName", async () => {
			const testPerformance = installTestPerformance();
			const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				let endFirst: (() => void) | undefined;
				const first = PerformanceEvent.timedExecAsync(
					logger,
					{ eventName: "ConcurrentEvent" },
					async () =>
						new Promise<void>((resolve) => {
							endFirst = resolve;
						}),
				);

				await PerformanceEvent.timedExecAsync(
					logger,
					{ eventName: "ConcurrentEvent" },
					async () => {},
				);
				endFirst?.();
				await first;

				assert.equal(
					new Set(testPerformance.markNames).size,
					testPerformance.markNames.length,
				);
				assert.equal(
					new Set(testPerformance.measureNames).size,
					testPerformance.measureNames.length,
				);
				clock.tick(20_000);
			} finally {
				clock.restore();
			}
		});

		it("keeps Performance API entries for at least one cleanup interval before clearing them", () => {
			const testPerformance = installTestPerformance();
			const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				PerformanceEvent.timedExec(logger, { eventName: "FirstEvent" }, () => {});
				clock.tick(9999);
				PerformanceEvent.timedExec(logger, { eventName: "SecondEvent" }, () => {});
				clock.tick(1);

				const firstMarkNames = testPerformance.markNames.filter((name) =>
					name.includes("FirstEvent"),
				);
				const firstMeasureNames = testPerformance.measureNames.filter((name) =>
					name.includes("FirstEvent"),
				);
				assert.equal(firstMarkNames.length, 2);
				assert.equal(firstMeasureNames.length, 1);
				assert.deepEqual(testPerformance.clearedMarkNames, []);
				assert.deepEqual(testPerformance.clearedMeasureNames, []);

				clock.tick(10_000);
				assert.deepEqual(testPerformance.clearedMarkNames, testPerformance.markNames);
				assert.deepEqual(testPerformance.clearedMeasureNames, testPerformance.measureNames);
			} finally {
				clock.restore();
			}
		});

		it("clears orphaned start marks from cancelled events without creating measures", () => {
			const testPerformance = installTestPerformance();
			const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				const event = PerformanceEvent.start(logger, { eventName: "CancelledEvent" });

				event.cancel();
				clock.tick(20_000);

				assert.deepEqual(testPerformance.clearedMarkNames, testPerformance.markNames);
				assert.deepEqual(testPerformance.measureNames, []);
				assert.deepEqual(testPerformance.clearedMeasureNames, []);
			} finally {
				clock.restore();
			}
		});

		it("cleans up marks when Performance API measure throws a benign SyntaxError", () => {
			const testPerformance = installTestPerformance();
			testPerformance.measure = () => {
				throw new SyntaxError("Missing mark");
			};
			const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				PerformanceEvent.timedExec(logger, { eventName: "SyntaxErrorEvent" }, () => {});
				clock.tick(20_000);

				assert.equal(logger.eventsLogged, 1);
				assert.deepEqual(testPerformance.clearedMarkNames, testPerformance.markNames);
			} finally {
				clock.restore();
			}
		});

		it("propagates non-benign Performance API measure errors after queuing mark cleanup", () => {
			const testPerformance = installTestPerformance();
			const measureError = new TypeError("Unexpected measure failure");
			testPerformance.measure = () => {
				throw measureError;
			};
			const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				assert.throws(
					() => PerformanceEvent.timedExec(logger, { eventName: "TypeErrorEvent" }, () => {}),
					measureError,
				);
				clock.tick(20_000);

				assert.deepEqual(testPerformance.clearedMarkNames, testPerformance.markNames);
			} finally {
				clock.restore();
			}
		});

		it("cleans up orphaned start marks when a timedExec callback throws", () => {
			const testPerformance = installTestPerformance();
			const callbackError = new Error("Callback failed");
			const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				assert.throws(
					() =>
						PerformanceEvent.timedExec(logger, { eventName: "CallbackThrowEvent" }, () => {
							throw callbackError;
						}),
					callbackError,
				);
				clock.tick(20_000);

				assert.deepEqual(testPerformance.clearedMarkNames, testPerformance.markNames);
			} finally {
				clock.restore();
			}
		});

		it("does not use Performance API marks when the full API is unavailable", () => {
			Object.defineProperty(globalThis, "performance", {
				configurable: true,
				value: {
					mark: () => {
						throw new Error("mark should not be called without the full Performance API");
					},
					now: () => 0,
				},
			});

			PerformanceEvent.timedExec(logger, { eventName: "PartialPerformanceApi" }, () => {});
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

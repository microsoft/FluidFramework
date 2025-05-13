/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

import { PerformanceEvent, TelemetryLogger } from "../logger.js";
import type { ITelemetryLoggerExt } from "../telemetryTypes.js";

class MockLogger extends TelemetryLogger implements ITelemetryLoggerExt {
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

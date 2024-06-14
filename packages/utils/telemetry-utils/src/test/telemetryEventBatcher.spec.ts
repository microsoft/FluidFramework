/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import sinon from "sinon";

import { TelemetryEventBatcher } from "../telemetryEventBatcher.js";
import type {
	ITelemetryErrorEventExt,
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "../telemetryTypes.js";

/**
 * @remarks Initialized in advance to extract its keys for type checking.
 * Arbitrary properties that can be logged with the telemetry event.
 */
interface TestTelemetryProperties {
	propertyOne: number;
	propertyTwo: number;
	propertyThree: number;
}

/**
 * Test logger with only necessary functionality used by the TelemetryEventBatcher
 */
class TestLogger implements ITelemetryLoggerExt {
	public events: ITelemetryPerformanceEventExt[] = [];

	public sendPerformanceEvent(event: ITelemetryPerformanceEventExt, error?: unknown): void {
		this.events.push(event);
	}

	public send(event: ITelemetryBaseEvent): void {
		throw new Error("Method not implemented.");
	}
	public sendTelemetryEvent(event: ITelemetryGenericEventExt, error?: unknown): void {
		throw new Error("Method not implemented.");
	}
	public sendErrorEvent(event: ITelemetryErrorEventExt, error?: unknown): void {
		throw new Error("Method not implemented.");
	}
	public supportsTags?: true | undefined;
}

describe("TelemetryEventBatcher", () => {
	let logger: TestLogger;

	beforeEach(() => {
		logger = new TestLogger();
	});

	it("only writes event after threshold for number of calls is reached", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		for (let i = 0; i < threshold - 1; i++) {
			eventBatcher.measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}
		assert.strictEqual(logger.events.length, 0);

		eventBatcher.measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));
		assert.strictEqual(logger.events.length, 1);

		for (let i = 0; i < threshold - 1; i++) {
			eventBatcher.measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}
		assert.strictEqual(logger.events.length, 1);

		eventBatcher.measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));
		assert.strictEqual(logger.events.length, 2);
	});

	it("contains correct telemetryProperties", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		for (let i = 0; i < threshold; i++) {
			eventBatcher.measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}

		assert.strictEqual(logger.events.length, 1);

		assert.strictEqual(logger.events[0].avgpropertyOne, 1);
		assert.strictEqual(logger.events[0].avgpropertyTwo, 2);
		assert.strictEqual(logger.events[0].avgpropertyThree, 3);
		assert.strictEqual(logger.events[0].maxpropertyOne, 1);
		assert.strictEqual(logger.events[0].maxpropertyTwo, 2);
		assert.strictEqual(logger.events[0].maxpropertyThree, 3);
	});

	it("contains correct telemetryProperties returned from the logger", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		for (let i = 0; i < threshold - 1; i++) {
			eventBatcher.measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}
		const result = eventBatcher.measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));

		assert.strictEqual(logger.events.length, 1);

		assert.strictEqual(result.telemetryProperties.propertyOne, 1);
		assert.strictEqual(result.telemetryProperties.propertyTwo, 2);
		assert.strictEqual(result.telemetryProperties.propertyThree, 3);
	});

	it("correctly calculates average and max values for multiple events", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		for (let i = 1; i <= threshold; i++) {
			eventBatcher.measure(() => ({
				telemetryProperties: {
					propertyOne: i,
					propertyTwo: i + 10,
					propertyThree: i + 100,
				},
			}));
		}

		assert.strictEqual(logger.events.length, 1);

		assert.strictEqual(logger.events[0].avgpropertyOne, 5.5);
		assert.strictEqual(logger.events[0].avgpropertyTwo, 15.5);
		assert.strictEqual(logger.events[0].avgpropertyThree, 105.5);
		assert.strictEqual(logger.events[0].maxpropertyOne, 10);
		assert.strictEqual(logger.events[0].maxpropertyTwo, 20);
		assert.strictEqual(logger.events[0].maxpropertyThree, 110);

		// More calls to validate that the average and max are "fresh", i.e. the previous data was cleared when the first telemetry event was generated
		for (let i = 101; i <= threshold + 100; i++) {
			eventBatcher.measure(() => ({
				telemetryProperties: {
					propertyOne: i,
					propertyTwo: i + 10,
					propertyThree: i + 100,
				},
			}));
		}

		assert.strictEqual(logger.events.length, 2);

		assert.strictEqual(logger.events[1].avgpropertyOne, 105.5);
		assert.strictEqual(logger.events[1].avgpropertyTwo, 115.5);
		assert.strictEqual(logger.events[1].avgpropertyThree, 205.5);
		assert.strictEqual(logger.events[1].maxpropertyOne, 110);
		assert.strictEqual(logger.events[1].maxpropertyTwo, 120);
		assert.strictEqual(logger.events[1].maxpropertyThree, 210);
	});

	it("separately emits event in different instances", () => {
		const thresholdOne = 10;
		const loggerOne = new TestLogger();
		const batcherOne = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEventOne" },
			loggerOne,
			thresholdOne,
		);

		const thresholdTwo = 20;
		const loggerTwo = new TestLogger();
		const batcherTwo = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEventTwo" },
			loggerTwo,
			thresholdTwo,
		);

		for (let i = 0; i < thresholdOne - 1; i++) {
			batcherOne.measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}

		for (let i = 0; i < thresholdTwo - 1; i++) {
			batcherTwo.measure(() => ({
				telemetryProperties: {
					propertyOne: 4,
					propertyTwo: 5,
					propertyThree: 6,
				},
			}));
		}

		assert.strictEqual(loggerOne.events.length, 0);
		assert.strictEqual(loggerTwo.events.length, 0);

		const resultOne = batcherOne.measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));

		const resultTwo = batcherTwo.measure(() => ({
			telemetryProperties: {
				propertyOne: 4,
				propertyTwo: 5,
				propertyThree: 6,
			},
		}));

		assert.strictEqual(loggerOne.events.length, 1);
		assert.strictEqual(loggerTwo.events.length, 1);

		assert.strictEqual(resultOne.telemetryProperties.propertyOne, 1);
		assert.strictEqual(resultOne.telemetryProperties.propertyTwo, 2);
		assert.strictEqual(resultOne.telemetryProperties.propertyThree, 3);

		assert.strictEqual(resultTwo.telemetryProperties.propertyOne, 4);
		assert.strictEqual(resultTwo.telemetryProperties.propertyTwo, 5);
		assert.strictEqual(resultTwo.telemetryProperties.propertyThree, 6);
	});

	it("correctly calculates duration", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		const clock = sinon.useFakeTimers();
		const startingPoint = 50; // Arbitrary starting point.
		let totalTime = 0; // Sum of all durations.

		for (let i = 1; i <= threshold; i++) {
			eventBatcher.measure(() => {
				clock.tick(startingPoint + i);
				totalTime += startingPoint + i;

				return {
					telemetryProperties: {
						propertyOne: 1,
						propertyTwo: 2,
						propertyThree: 3,
					},
				};
			});
		}

		assert.strictEqual(logger.events.length, 1);
		assert.strictEqual(logger.events[0].duration, totalTime / threshold);
	});
});

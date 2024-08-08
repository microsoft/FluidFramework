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
import { measure } from "../utils.js";

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
 * @remarks Initialized in advance to extract its keys for type checking.
 * Arbitrary properties with duration.
 */
interface TestTelemetryPropertiesWithDuration extends TestTelemetryProperties {
	duration: number;
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
			const { output: outputOne } = measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
			eventBatcher.accumulateAndLog({ ...outputOne.telemetryProperties });
		}
		assert.strictEqual(logger.events.length, 0);

		const { output: outputTwo } = measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));
		eventBatcher.accumulateAndLog({ ...outputTwo.telemetryProperties });
		assert.strictEqual(logger.events.length, 1);

		for (let i = 0; i < threshold - 1; i++) {
			const { output: outputThree } = measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
			eventBatcher.accumulateAndLog({ ...outputThree.telemetryProperties });
		}
		assert.strictEqual(logger.events.length, 1);

		const { output: outputFour } = measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));
		eventBatcher.accumulateAndLog({ ...outputFour.telemetryProperties });
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
			const { output } = measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
			eventBatcher.accumulateAndLog({ ...output.telemetryProperties });
		}

		assert.strictEqual(logger.events.length, 1);

		assert.strictEqual(logger.events[0].avg_propertyOne, 1);
		assert.strictEqual(logger.events[0].avg_propertyTwo, 2);
		assert.strictEqual(logger.events[0].avg_propertyThree, 3);
		assert.strictEqual(logger.events[0].max_propertyOne, 1);
		assert.strictEqual(logger.events[0].max_propertyTwo, 2);
		assert.strictEqual(logger.events[0].max_propertyThree, 3);
	});

	it("correctly calculates average and max values for multiple events", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		for (let i = 1; i <= threshold; i++) {
			const { output } = measure(() => ({
				telemetryProperties: {
					propertyOne: i,
					propertyTwo: i + 10,
					propertyThree: i + 100,
				},
			}));
			eventBatcher.accumulateAndLog({ ...output.telemetryProperties });
		}

		assert.strictEqual(logger.events.length, 1);

		assert.strictEqual(logger.events[0].avg_propertyOne, 5.5);
		assert.strictEqual(logger.events[0].avg_propertyTwo, 15.5);
		assert.strictEqual(logger.events[0].avg_propertyThree, 105.5);
		assert.strictEqual(logger.events[0].max_propertyOne, 10);
		assert.strictEqual(logger.events[0].max_propertyTwo, 20);
		assert.strictEqual(logger.events[0].max_propertyThree, 110);

		// More calls to validate that the average and max are "fresh", i.e. the previous data was cleared when the first telemetry event was generated
		for (let i = 101; i <= threshold + 100; i++) {
			const { output } = measure(() => ({
				telemetryProperties: {
					propertyOne: i,
					propertyTwo: i + 10,
					propertyThree: i + 100,
				},
			}));
			eventBatcher.accumulateAndLog({ ...output.telemetryProperties });
		}

		assert.strictEqual(logger.events.length, 2);

		assert.strictEqual(logger.events[1].avg_propertyOne, 105.5);
		assert.strictEqual(logger.events[1].avg_propertyTwo, 115.5);
		assert.strictEqual(logger.events[1].avg_propertyThree, 205.5);
		assert.strictEqual(logger.events[1].max_propertyOne, 110);
		assert.strictEqual(logger.events[1].max_propertyTwo, 120);
		assert.strictEqual(logger.events[1].max_propertyThree, 210);
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
			const { output: outputOne } = measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
			batcherOne.accumulateAndLog({ ...outputOne.telemetryProperties });
		}

		for (let i = 0; i < thresholdTwo - 1; i++) {
			const { output: outputTwo } = measure(() => ({
				telemetryProperties: {
					propertyOne: 4,
					propertyTwo: 5,
					propertyThree: 6,
				},
			}));
			batcherTwo.accumulateAndLog({ ...outputTwo.telemetryProperties });
		}

		assert.strictEqual(loggerOne.events.length, 0);
		assert.strictEqual(loggerTwo.events.length, 0);

		const { output: resultOne } = measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));
		batcherOne.accumulateAndLog({ ...resultOne.telemetryProperties });

		const { output: resultTwo } = measure(() => ({
			telemetryProperties: {
				propertyOne: 4,
				propertyTwo: 5,
				propertyThree: 6,
			},
		}));
		batcherTwo.accumulateAndLog({ ...resultTwo.telemetryProperties });

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
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryPropertiesWithDuration>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		const clock = sinon.useFakeTimers();
		const startingPoint = 50; // Arbitrary starting point.
		let totalTime = 0; // Sum of all durations.

		for (let i = 1; i <= threshold; i++) {
			const { duration, output } = measure(() => {
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
			eventBatcher.accumulateAndLog({ duration, ...output.telemetryProperties });
		}

		assert.strictEqual(logger.events.length, 1);
		assert.strictEqual(logger.events[0].avg_duration, totalTime / threshold);
	});
});

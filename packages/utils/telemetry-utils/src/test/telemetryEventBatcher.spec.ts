/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import sinon from "sinon";

import { TelemetryEventBatcher } from "../telemetryEventBatcher.js";
import {
	type ITelemetryErrorEventExt,
	type ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	type ITelemetryPerformanceEventExt,
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

	sendPerformanceEvent(event: ITelemetryPerformanceEventExt, error?: unknown): void {
		this.events.push(event);
	}

	send(event: ITelemetryBaseEvent): void {
		throw new Error("Method not implemented.");
	}
	sendTelemetryEvent(event: ITelemetryGenericEventExt, error?: unknown): void {
		throw new Error("Method not implemented.");
	}
	sendErrorEvent(event: ITelemetryErrorEventExt, error?: unknown): void {
		throw new Error("Method not implemented.");
	}
	supportsTags?: true | undefined;
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
				eventName: "testCall",
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}
		assert.strictEqual(logger.events.length, 1);

		eventBatcher.measure(() => ({
			eventName: "testCall",
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

		for (let i = 0; i < threshold - 1; i++) {
			eventBatcher.measure(() => ({
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}
		const resultOne = eventBatcher.measure(() => ({
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));

		assert.strictEqual(logger.events.length, 1);

		assert.strictEqual(resultOne.telemetryProperties.propertyOne, 1);
		assert.strictEqual(resultOne.telemetryProperties.propertyTwo, 2);
		assert.strictEqual(resultOne.telemetryProperties.propertyThree, 3);
	});

	it("correctly calculates average and max values", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		const spy = sinon.spy(logger, "sendPerformanceEvent");
		let loggedEvent: ITelemetryPerformanceEventExt;

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
		loggedEvent = logger.events[0];

		assert.strictEqual(loggedEvent.avgpropertyOne, 5.5);
		assert.strictEqual(loggedEvent.avgpropertyTwo, 15.5);
		assert.strictEqual(loggedEvent.avgpropertyThree, 105.5);
		assert.strictEqual(loggedEvent.maxpropertyOne, 10);
		assert.strictEqual(loggedEvent.maxpropertyTwo, 20);
		assert.strictEqual(loggedEvent.maxpropertyThree, 110);

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
		loggedEvent = logger.events[1];

		assert.strictEqual(loggedEvent.avgpropertyOne, 105.5);
		assert.strictEqual(loggedEvent.avgpropertyTwo, 115.5);
		assert.strictEqual(loggedEvent.avgpropertyThree, 205.5);
		assert.strictEqual(loggedEvent.maxpropertyOne, 110);
		assert.strictEqual(loggedEvent.maxpropertyTwo, 120);
		assert.strictEqual(loggedEvent.maxpropertyThree, 210);

		spy.restore();
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
				eventName: "testCall",
				telemetryProperties: {
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				},
			}));
		}

		for (let i = 0; i < thresholdTwo - 1; i++) {
			batcherTwo.measure(() => ({
				eventName: "testCall",
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
			eventName: "testCall",
			telemetryProperties: {
				propertyOne: 1,
				propertyTwo: 2,
				propertyThree: 3,
			},
		}));

		const resultTwo = batcherTwo.measure(() => ({
			eventName: "testCall",
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

	it("correctly calculates data in different instances", () => {
		const thresholdOne = 10;
		const loggerOne = new TestLogger();
		const batcherOne = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEventOne" },
			loggerOne,
			thresholdOne,
		);
		const spyOne = sinon.spy(loggerOne, "sendPerformanceEvent");

		const thresholdTwo = 20;
		const loggerTwo = new TestLogger();
		const batcherTwo = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEventTwo" },
			loggerTwo,
			thresholdTwo,
		);
		const spyTwo = sinon.spy(loggerTwo, "sendPerformanceEvent");

		for (let i = 1; i <= thresholdOne; i++) {
			batcherOne.measure(() => ({
				eventName: "testCall",
				telemetryProperties: {
					propertyOne: i + 10,
					propertyTwo: i * 10,
					propertyThree: i ** 2,
				},
			}));
		}

		for (let i = 1; i <= thresholdTwo; i++) {
			batcherTwo.measure(() => ({
				eventName: "testCall",
				telemetryProperties: {
					propertyOne: i + 100,
					propertyTwo: i * 100,
					propertyThree: i ** 3,
				},
			}));
		}

		const loggedEventOne = loggerOne.events[0];
		const loggedEventTwo = loggerTwo.events[0];

		assert.strictEqual(loggedEventOne.avgpropertyOne, 15.5);
		assert.strictEqual(loggedEventOne.avgpropertyTwo, 55);
		assert.strictEqual(loggedEventOne.avgpropertyThree, 38.5);
		assert.strictEqual(loggedEventOne.maxpropertyOne, 20);
		assert.strictEqual(loggedEventOne.maxpropertyTwo, 100);
		assert.strictEqual(loggedEventOne.maxpropertyThree, 100);

		assert.strictEqual(loggedEventTwo.avgpropertyOne, 110.5);
		assert.strictEqual(loggedEventTwo.avgpropertyTwo, 1050);
		assert.strictEqual(loggedEventTwo.avgpropertyThree, 2205);
		assert.strictEqual(loggedEventTwo.maxpropertyOne, 120);
		assert.strictEqual(loggedEventTwo.maxpropertyTwo, 2000);
		assert.strictEqual(loggedEventTwo.maxpropertyThree, 8000);

		spyOne.restore();
		spyTwo.restore();
	});

	it("correctly calculates average, max values, and duration", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

		const clock = sinon.useFakeTimers();
		const spy = sinon.spy(logger, "sendPerformanceEvent");

		for (let i = 1; i <= threshold; i++) {
			const startTime = i * 100;
			const endTime = startTime + 50;
			clock.tick(endTime - startTime);
			eventBatcher.measure(() => {
				clock.tick(50);
				return {
					telemetryProperties: {
						propertyOne: i,
						propertyTwo: i + 10,
						propertyThree: i + 100,
					},
				};
			});
		}

		assert.strictEqual(logger.events.length, 1);
		const loggedEvent = logger.events[0];

		assert.strictEqual(loggedEvent.avgpropertyOne, 5.5);
		assert.strictEqual(loggedEvent.avgpropertyTwo, 15.5);
		assert.strictEqual(loggedEvent.avgpropertyThree, 105.5);
		assert.strictEqual(loggedEvent.maxpropertyOne, 10);
		assert.strictEqual(loggedEvent.maxpropertyTwo, 20);
		assert.strictEqual(loggedEvent.maxpropertyThree, 110);
		assert.strictEqual(loggedEvent.duration, 50);

		spy.restore();
	});
});

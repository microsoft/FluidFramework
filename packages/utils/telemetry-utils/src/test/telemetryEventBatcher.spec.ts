/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

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

	it("only writes event after correct number of thresholds", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);

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

	it.only("returns correct results for each property", () => {
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

		// for (let i = 1; i < threshold; i++) {
		// 	eventBatcher.measure(() => ({
		// 		telemetryProperties: {
		// 			propertyOne: i,
		// 			propertyTwo: i,
		// 			propertyThree: i,
		// 		},
		// 	}));
		// }

		// const resultTwo = eventBatcher.measure(() => ({
		// 	telemetryProperties: {
		// 		propertyOne: threshold,
		// 		propertyTwo: threshold,
		// 		propertyThree: threshold,
		// 	},
		// }));

		// assert.strictEqual(logger.events.length, 2);
		// assert.strictEqual(resultTwo.telemetryProperties.propertyOne, 5.5);
		// assert.strictEqual(resultTwo.telemetryProperties.propertyTwo, 5.5);
		// assert.strictEqual(resultTwo.telemetryProperties.propertyThree, 5.5);
	});
});

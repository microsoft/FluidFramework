/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type {
	ITelemetryBaseEvent,
	ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import sinon from "sinon";

import { SampledTelemetryHelper } from "../sampledTelemetryHelper.js";
import {
	type ITelemetryErrorEventExt,
	type ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	type ITelemetryPerformanceEventExt,
} from "../telemetryTypes.js";

/**
 * Test logger with only the necessary functionality used by the SampledTelemetryHelper
 * so we can test it.
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

const standardEventProperties = ["eventName", "duration", "count"];
const aggregateProperties = ["totalDuration", "minDuration", "maxDuration", "averageDuration"];

describe("SampledTelemetryHelper without Custom Data", () => {
	let logger: TestLogger;

	beforeEach(() => {
		logger = new TestLogger();
	});

	it("only writes event after correct number of samples", () => {
		const sampling = 10;
		const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, sampling);
		for (let i = 0; i < sampling - 1; i++) {
			helper.measure(() => {});
		}
		assert.strictEqual(logger.events.length, 0);
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 1);

		// Again to make sure the internal counter is reset correctly
		for (let i = 0; i < sampling - 1; i++) {
			helper.measure(() => {});
		}
		assert.strictEqual(logger.events.length, 1);
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 2);
	});

	it("does not include aggregate properties when it shouldn't", () => {
		const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 1, false);
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 1);
		const event = logger.events[0];
		ensurePropertiesExist(event, standardEventProperties, true);
		assert.strictEqual(event.count, 1);
	});

	it("includes aggregate properties when it should", () => {
		const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 1, true);
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 1);
		const event = logger.events[0];
		ensurePropertiesExist(event, [...standardEventProperties, ...aggregateProperties], true);
		assert.strictEqual(event.count, 1);
	});

	it("includes properties from base event when no aggregate properties are included", () => {
		const helper = new SampledTelemetryHelper(
			{ eventName: "testEvent", myProp: "myValue" },
			logger,
			1,
			false,
		);
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 1);
		const event = logger.events[0];
		ensurePropertiesExist(event, [...standardEventProperties, "myProp"], true);
		assert.strictEqual(event.count, 1);
		assert.strictEqual(event.myProp, "myValue");
	});

	it("includes properties from base event when aggregate properties are included", () => {
		const helper = new SampledTelemetryHelper(
			{ eventName: "testEvent", myProp: "myValue" },
			logger,
			1,
			true,
		);
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 1);
		const event = logger.events[0];
		ensurePropertiesExist(
			event,
			[...standardEventProperties, ...aggregateProperties, "myProp"],
			true,
		);
		assert.strictEqual(event.count, 1);
		assert.strictEqual(event.myProp, "myValue");
	});

	it("tracks buckets separately and includes per-bucket properties", () => {
		const bucket1 = "bucket1";
		const bucket2 = "bucket2";
		const bucketProperties: Map<string, ITelemetryBaseProperties> = new Map<
			string,
			ITelemetryBaseProperties
		>([
			[bucket1, { prop1: "value1" }],
			[bucket2, { prop2: "value2" }],
		]);

		const helper = new SampledTelemetryHelper(
			{ eventName: "testEvent" },
			logger,
			3,
			false,
			bucketProperties,
		);

		for (let i = 0; i < 9; i++) {
			helper.measure(() => {}, bucket1);
		}
		for (let i = 0; i < 7; i++) {
			helper.measure(() => {}, bucket2);
		}

		assert.strictEqual(logger.events.filter((x) => x.prop1 === "value1").length, 3);
		assert.strictEqual(logger.events.filter((x) => x.prop2 === "value2").length, 2);
	});

	it("bucket properties do not override measurement properties", () => {
		// If the names of the properties specified by the consumers for a bucket overlap with the names
		// of the standard properties we put in the telemetry events, our values should not be overwritten
		// by the custom properties.

		const bucket1 = "bucket1";
		const bucketProperties: Map<string, ITelemetryBaseProperties> = new Map<
			string,
			ITelemetryBaseProperties
		>([
			// Here just using a duration value that we can be sure will not be the actual value, to make sure the
			// actuals is different from this one (since it's much harder to guarantee an exact duration
			// value to test for equality).
			[bucket1, { duration: 1000, count: 1000 }],
		]);

		const helper = new SampledTelemetryHelper(
			{ eventName: "testEvent" },
			logger,
			1,
			false,
			bucketProperties,
		);
		helper.measure(() => {}, bucket1);
		assert.strictEqual(logger.events.length, 1);
		const event = logger.events[0];
		assert.strictEqual(event.count, 1);
		assert(event.duration !== bucketProperties.get("bucket1")!.duration);
	});

	it("generates telemetry event from buffered data when disposed", () => {
		// Logging several buckets to make sure they are all flushed. We can only distingush the events based on the
		// custom properties added to the event for each bucket
		const bucket1 = "bucket1";
		const bucket2 = "bucket2";
		const bucketProperties: Map<string, ITelemetryBaseProperties> = new Map<
			string,
			ITelemetryBaseProperties
		>([
			[bucket1, { prop1: "value1" }],
			[bucket2, { prop2: "value2" }],
		]);

		const helper = new SampledTelemetryHelper(
			{ eventName: "testEvent" },
			logger,
			5,
			false,
			bucketProperties,
		);

		// Only measure 4 times when we need 5 samples before writing the telemetry event
		for (let i = 0; i < 4; i++) {
			helper.measure(() => {}, bucket1);
			helper.measure(() => {}, bucket2);
		}

		// Nothing should have been logged yet
		assert.strictEqual(logger.events.length, 0);

		// After disposing, there should be one event for each bucket
		helper.dispose();
		assert.strictEqual(logger.events.filter((x) => x.prop1 === "value1").length, 1);
		assert.strictEqual(logger.events.filter((x) => x.prop2 === "value2").length, 1);
	});

	it("no event is generated on dispose if there's no pending 'buffered' data", () => {
		const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 2);

		// Nothing should have been logged after the first call
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 0);

		// On the second call, we should have 1 event
		helper.measure(() => {});
		assert.strictEqual(logger.events.length, 1);

		// After disposing, there should still be just one event
		helper.dispose();
		assert.strictEqual(logger.events.length, 1);
	});
});

/**
 * @remarks Initialized in advance to extract its keys for type checking.
 * Arbitrary properties that can be logged with the telemetry event.
 */
interface TestTelemetryProperties {
	propertyOne: number;
	propertyTwo: number;
	propertyThree: number;
	[key: string]: number;
}

describe("SampledTelemetryHelper with Custom Data", () => {
	let logger: TestLogger;

	beforeEach(() => {
		logger = new TestLogger();
	});

	it("Correctly returns computed averages and maxes for custom data", () => {
		const sampling = 10;
		const helper = new SampledTelemetryHelper<TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			sampling,
		);

		for (let i = 0; i < sampling; i++) {
			helper.measure((event) => {
				event.incrementMetric({
					propertyOne: 1,
					propertyTwo: 2,
					propertyThree: 3,
				});
			});
		}

		assert.strictEqual(logger.events.length, 1);
		assert.strictEqual(logger.events[0].avg_propertyOne, 1);
		assert.strictEqual(logger.events[0].avg_propertyTwo, 2);
		assert.strictEqual(logger.events[0].avg_propertyThree, 3);
		assert.strictEqual(logger.events[0].max_propertyOne, 1);
		assert.strictEqual(logger.events[0].max_propertyTwo, 2);
		assert.strictEqual(logger.events[0].max_propertyThree, 3);
	});

	it("Correctly returns computed duration for custom data", () => {
		const sampling = 10;
		const helper = new SampledTelemetryHelper<TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			sampling,
			true /* includeAggregateMetrics */,
		);

		const clock = sinon.useFakeTimers();
		const startingPoint = 50; // Arbitrary starting point.
		let totalDuration = 0;
		let maxDuration = Number.MIN_VALUE;
		let minDuration = Number.MAX_VALUE;

		for (let i = 0; i < sampling; i++) {
			helper.measure(() => {
				const currentIterationDuration = startingPoint + i;

				clock.tick(currentIterationDuration);
				totalDuration += currentIterationDuration;
				maxDuration = Math.max(maxDuration, currentIterationDuration);
				minDuration = Math.min(minDuration, currentIterationDuration);
			});
		}

		clock.restore();

		assert.strictEqual(logger.events.length, 1);
		assert.strictEqual(logger.events[0].totalDuration, totalDuration);
		assert.strictEqual(logger.events[0].averageDuration, totalDuration / sampling);
		assert.strictEqual(logger.events[0].maxDuration, maxDuration);
		assert.strictEqual(logger.events[0].minDuration, minDuration);
	});
});

function ensurePropertiesExist(
	object: ITelemetryPerformanceEventExt,
	propNames: string[],
	noExtraProperties: boolean = false,
): void {
	for (const name of propNames) {
		assert.strictEqual(object[name] !== undefined, true);
	}

	if (noExtraProperties) {
		const actualNumberOfProps = Object.keys(object).length;
		const expectedNumberOfProps = propNames.length;
		if (actualNumberOfProps !== expectedNumberOfProps) {
			assert.fail(
				`Object contains unexpected properties ` +
					`(${actualNumberOfProps} found, ${expectedNumberOfProps}) expected)`,
			);
		}
	}
}

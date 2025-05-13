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
 * Test logger with only the necessary functionality used by the SampledTelemetryHelper
 * so we can test it.
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

const standardEventProperties = ["eventName", "duration", "count"];
const aggregateProperties = ["totalDuration", "minDuration", "maxDuration", "averageDuration"];

describe("SampledTelemetryHelper", () => {
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
			helper.measure(() => ({ customData: {} }), bucket1);
		}
		for (let i = 0; i < 7; i++) {
			helper.measure(() => ({ customData: {} }), bucket2);
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
		helper.measure(() => ({ customData: {} }), bucket1);
		assert.strictEqual(logger.events.length, 1);
		const event = logger.events[0];
		assert.strictEqual(event.count, 1);
		assert(event.duration !== bucketProperties.get("bucket1")?.duration);
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

	it("Correctly returns computed duration for custom data", () => {
		const sampling = 10;
		const helper = new SampledTelemetryHelper(
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

	it("Correctly returns computed averages and maxes for custom data", () => {
		const sampling = 10;

		const helper = new SampledTelemetryHelper<void, TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			sampling,
		);

		for (let i = 0; i < sampling; i++) {
			helper.measure(() => {
				return {
					customData: {
						propertyOne: i + 1,
						propertyTwo: i + 2,
						propertyThree: i + 3,
					},
				};
			});
		}

		assert.strictEqual(logger.events.length, 1);
		assert.strictEqual(logger.events[0].avg_propertyOne, 5.5);
		assert.strictEqual(logger.events[0].avg_propertyTwo, 6.5);
		assert.strictEqual(logger.events[0].avg_propertyThree, 7.5);
		assert.strictEqual(logger.events[0].max_propertyOne, 10);
		assert.strictEqual(logger.events[0].max_propertyTwo, 11);
		assert.strictEqual(logger.events[0].max_propertyThree, 12);
	});

	it("explicit return type and custom data type", () => {
		const helperTypeNumber = new SampledTelemetryHelper<number, TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			10,
		);

		// Measure should be able to return a value of the type specified during helper creation and custom data.
		helperTypeNumber.measure(() => ({
			returnValue: 64,
			customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
		}));

		helperTypeNumber.measure(() => ({
			returnValue: 128,
			customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
		}));

		const helperTypeBoolean = new SampledTelemetryHelper<boolean, TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			10,
		);

		helperTypeBoolean.measure(() => ({
			returnValue: true,
			customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
		}));

		helperTypeBoolean.measure(() => ({
			returnValue: false,
			customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
		}));
	});

	// This is deliberatly skipped because it contains compile-time tests. We don't want to actually run this code.
	describe.skip("compile-time tests", () => {
		it("no return type and no custom data type", () => {
			const helper = new SampledTelemetryHelper<void, void>(
				{ eventName: "testEvent" },
				logger,
				10,
			);

			// Measure should be able to not return anything.
			helper.measure(() => {});

			// As far as I know we can't really do much to prevent functions that return _something_ from being passed.
			// If there's a way to make these compile-time errors, it'd be nice.
			helper.measure(() => true);
			helper.measure(() => ({
				returnValue: true,
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));
		});

		it("no return type and no custom data type", () => {
			const helper = new SampledTelemetryHelper<void, void>(
				{ eventName: "testEvent" },
				logger,
				10,
			);

			// Measure should be able to not return anything.
			helper.measure(() => {});

			// As far as I know we can't really do much to prevent functions that return _something_ from being passed.
			// If there's a way to make these compile-time errors, it'd be nice.
			helper.measure(() => true);
			helper.measure(() => ({
				returnValue: true,
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));
		});

		it("explicit return type and no custom data type", () => {
			const helper = new SampledTelemetryHelper<boolean>(
				{ eventName: "testEvent" },
				logger,
				10,
			);

			// Measure should be able to return a plain value of the type specified during helper creation.
			helper.measure(() => true);

			// Measure should not be able to return a plain value of a type that is not the one specified during helper creation.
			// @ts-expect-error -- We want this to be a compile-time error
			helper.measure(() => "");

			// Measure should not be able to not return anything, because a return type was specified during helper creation.
			// @ts-expect-error -- We want this to be a compile-time error
			helper.measure(() => {});

			// Measure should not be able to return custom data (even if the return value is of the correct type) because no
			// custom data type was specified during helper creation.
			// @ts-expect-error -- We want this to be a compile-time error
			helper.measure(() => ({
				returnValue: true,
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));
		});

		it("no return type and explicit custom data type", () => {
			const helper = new SampledTelemetryHelper<void, TestTelemetryProperties>(
				{ eventName: "testEvent" },
				logger,
				10,
			);

			// Measure should be able to return custom data and no returnValue, or set it to undefined
			helper.measure(() => ({
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));
			helper.measure(() => ({
				returnValue: undefined,
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));

			// Measure should not be able to not return anything; custom data is required.
			// @ts-expect-error -- We want this to be a compile-time error
			helper.measure(() => {});

			// Measure should not be able to return a plain value; custom data is required.
			// @ts-expect-error -- We want this to be a compile-time error
			helper.measure(() => "");

			// Measure should not be able to return a plain value even if custom data is required; return value must be
			// undefined because the helper was told to expect no return value.
			helper.measure(() => ({
				// @ts-expect-error -- We want this to be a compile-time error
				returnValue: true,
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));
		});

		it("explicit return type and custom data type", () => {
			const helper = new SampledTelemetryHelper<boolean, TestTelemetryProperties>(
				{ eventName: "testEvent" },
				logger,
				10,
			);

			// Measure should be able to return a value of the type specified during helper creation and custom data.
			helper.measure(() => ({
				returnValue: true,
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));

			// Measure should not be able to return something of incorrect type, even if the returned custom data is correct.
			helper.measure(() => ({
				// @ts-expect-error -- Can't return a value of the incorrect type
				returnValue: "",
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));
			// @ts-expect-error -- Can't try not to include a return value
			helper.measure(() => ({
				customData: { propertyOne: 1, propertyTwo: 2, propertyThree: 3 },
			}));

			// Measure should not be able to return without custom data, because a custom data type was specified during
			// helper creation.
			// @ts-expect-error -- Can't return a value of the correct type without custom data
			helper.measure(() => true);
			// @ts-expect-error -- Can't return a value of the incorrect type without custom data
			helper.measure(() => "");
			// @ts-expect-error -- Can't try to not return anything without custom data
			helper.measure(() => {});
		});
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

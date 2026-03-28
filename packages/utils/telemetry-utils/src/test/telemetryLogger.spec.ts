/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	Tagged,
} from "@fluidframework/core-interfaces";

import {
	type ITelemetryLoggerPropertyBag,
	type ITelemetryLoggerPropertyBags,
	LogLevelValue,
	TelemetryLogger,
	convertToBasePropertyType,
	createChildLogger,
} from "../logger.js";
import type { TelemetryEventPropertyTypeExt } from "../telemetryTypes.js";

class TestTelemetryLogger extends TelemetryLogger {
	public events: ITelemetryBaseEvent[] = [];
	public send(event: ITelemetryBaseEvent): void {
		this.events.push(this.prepareEvent(event));
	}
}

const allCases: ITelemetryLoggerPropertyBag[] = [
	{},
	{ allProp: 1 },
	{ allGetter: (): number => 1 },
	{ allProp: 1, allGetter: (): number => 1 },
];
const errorCases: ITelemetryLoggerPropertyBag[] = [
	{},
	{ errorProp: 2 },
	{ errorGetter: (): number => 2 },
	{ errorProp: 2, errorGetter: (): number => 2 },
];

// eslint-disable-next-line unicorn/no-array-reduce
const propertyCases: (ITelemetryLoggerPropertyBags | undefined)[] = allCases.reduce<
	ITelemetryLoggerPropertyBags[]
>((pv, all) => {
	pv.push(...errorCases.map((error) => ({ all, error })));
	return pv;
}, []);
propertyCases.push(
	...allCases.map((all) => ({ all, error: all })),
	...allCases,
	...errorCases,
	undefined,
);

describe("TelemetryLogger", () => {
	describe("Properties", () => {
		it("send", () => {
			for (const props of propertyCases) {
				const logger = new TestTelemetryLogger("namespace", props);
				logger.send({ category: "anything", eventName: "whatever" });
				assert.strictEqual(logger.events.length, 1);
				const event = logger.events[0];
				assert.strictEqual(event.category, "anything");
				assert.strictEqual(event.eventName, "namespace:whatever");
				const eventKeys = Object.keys(event);
				const propsKeys = Object.keys(props?.all ?? {});
				// +2 for category and event name
				assert.strictEqual(
					eventKeys.length,
					propsKeys.length + 2,
					`actual:\n${JSON.stringify(event)}\nexpected:${
						props ? JSON.stringify(props) : "undefined"
					}`,
				);
			}
		});

		it("sendErrorEvent", () => {
			for (const props of propertyCases) {
				const logger = new TestTelemetryLogger("namespace", props);
				logger.sendErrorEvent({ eventName: "whatever" });
				assert.strictEqual(logger.events.length, 1);
				const event = logger.events[0];
				assert.strictEqual(event.category, "error");
				assert.strictEqual(event.eventName, "namespace:whatever");
				const eventKeys = Object.keys(event);
				// should include error props too
				const expected = { error: "whatever", ...props?.all, ...props?.error };
				const propsKeys = Object.keys(expected);
				for (const k of propsKeys) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
					const e = typeof expected[k] === "function" ? expected[k]() : expected[k];
					assert.strictEqual(
						event[k],
						e,
						`${k} value does not match.
                         actual: ${JSON.stringify(event[k])} expected: ${JSON.stringify(e)}`,
					);
				}
				// +3 for category, event name, and logLevel
				assert.strictEqual(
					eventKeys.length,
					propsKeys.length + 3,
					`actual:\n${JSON.stringify(event)}\nexpected:${
						props ? JSON.stringify(props) : "undefined"
					}`,
				);
			}
		});

		it("sendErrorEvent with error field", () => {
			for (const props of propertyCases) {
				const logger = new TestTelemetryLogger("namespace", props);
				logger.sendErrorEvent({ eventName: "whatever", error: "bad" });
				assert.strictEqual(logger.events.length, 1);
				const event = logger.events[0];
				assert.strictEqual(event.category, "error");
				assert.strictEqual(event.eventName, "namespace:whatever");
				const eventKeys = Object.keys(event);
				// should include error props too
				const expected = { error: "bad", ...props?.all, ...props?.error };
				const propsKeys = Object.keys(expected);
				for (const k of propsKeys) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
					const e = typeof expected[k] === "function" ? expected[k]() : expected[k];
					assert.strictEqual(
						event[k],
						e,
						`${k} value does not match.
                         actual: ${JSON.stringify(event[k])} expected: ${JSON.stringify(e)}`,
					);
				}
				// +3 for category, event name, and logLevel
				assert.strictEqual(
					eventKeys.length,
					propsKeys.length + 3,
					`actual:\n${JSON.stringify(event)}\nexpected:${
						props ? JSON.stringify(props) : "undefined"
					}`,
				);
			}
		});

		it("sendErrorEvent with error object", () => {
			for (const props of propertyCases) {
				const logger = new TestTelemetryLogger("namespace", props);
				const error = new Error("badMessage");
				logger.sendErrorEvent({ eventName: "whatever" }, error);
				assert.strictEqual(logger.events.length, 1);
				const event = logger.events[0];
				assert.strictEqual(event.category, "error");
				assert.strictEqual(event.eventName, "namespace:whatever");
				const eventKeys = Object.keys(event);
				// should include error props too
				const expected = {
					error: error.message,
					...props?.all,
					...props?.error,
				};
				const propsKeys = Object.keys(expected);
				for (const k of propsKeys) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
					const e = typeof expected[k] === "function" ? expected[k]() : expected[k];
					assert.strictEqual(
						event[k],
						e,
						`${k} value does not match.
                         actual: ${JSON.stringify(event[k])} expected: ${JSON.stringify(e)}`,
					);
				}
				// +5 for category, event name, message, stack, and logLevel
				assert.strictEqual(
					eventKeys.length,
					propsKeys.length + 5,
					`actual:\n${JSON.stringify(event)}\nexpected:${
						props ? JSON.stringify(props) : "undefined"
					}`,
				);
			}
		});

		it("sendTelemetryEvent", () => {
			for (const props of propertyCases) {
				const logger = new TestTelemetryLogger("namespace", props);
				logger.sendTelemetryEvent({ eventName: "whatever" });
				assert.strictEqual(logger.events.length, 1);
				const event = logger.events[0];
				assert.strictEqual(event.category, "generic");
				assert.strictEqual(event.eventName, "namespace:whatever");
				const eventKeys = Object.keys(event);
				const propsKeys = Object.keys(props?.all ?? {});
				// +3 for category, event name, and logLevel
				assert.strictEqual(
					eventKeys.length,
					propsKeys.length + 3,
					`actual:\n${JSON.stringify(event)}\nexpected:${
						props ? JSON.stringify(props) : "undefined"
					}`,
				);
			}
		});
	});
});

describe("convertToBasePropertyType", () => {
	describe("tagged properties", () => {
		it("tagged number", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				value: 123,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: 123,
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("tagged string", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				value: "test",
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: "test",
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("tagged boolean", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				value: true,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: true,
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("tagged array", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				value: [true, "test"],
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: JSON.stringify([true, "test"]),
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("tagged flat object", () => {
			const value: TelemetryEventPropertyTypeExt = {
				a: 1,
				b: "two",
				c: true,
				d: [false, "okay"],
			};
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				value,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: JSON.stringify(value),
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
	});
	describe("untagged properties", () => {
		it("number", () => {
			const property: TelemetryEventPropertyTypeExt = 123;
			const converted = convertToBasePropertyType(property);
			const expected: TelemetryEventPropertyTypeExt = 123;
			assert.deepStrictEqual(converted, expected);
		});
		it("string", () => {
			const property: TelemetryEventPropertyTypeExt = "test";
			const converted = convertToBasePropertyType(property);
			const expected: TelemetryEventPropertyTypeExt = "test";
			assert.deepStrictEqual(converted, expected);
		});
		it("boolean", () => {
			const property: TelemetryEventPropertyTypeExt = true;
			const converted = convertToBasePropertyType(property);
			const expected: TelemetryEventPropertyTypeExt = true;
			assert.deepStrictEqual(converted, expected);
		});
		it("undefined", () => {
			const property: TelemetryEventPropertyTypeExt = undefined;
			const converted = convertToBasePropertyType(property);
			const expected: TelemetryEventPropertyTypeExt = undefined;
			assert.deepStrictEqual(converted, expected);
		});
		it("array", () => {
			const property: TelemetryEventPropertyTypeExt = [true, "test"];
			const converted = convertToBasePropertyType(property);
			const expected: TelemetryEventPropertyTypeExt = JSON.stringify([true, "test"]);
			assert.deepStrictEqual(converted, expected);
		});
		it("flat object", () => {
			const property: TelemetryEventPropertyTypeExt = {
				a: 1,
				b: "two",
				c: true,
				d: [false, "okay"],
				e: undefined,
			};
			const converted = convertToBasePropertyType(property);
			const expected: TelemetryEventPropertyTypeExt = JSON.stringify(property);
			assert.deepStrictEqual(converted, expected);
		});
		it("flat object with only undefined", () => {
			const property: TelemetryEventPropertyTypeExt = {
				e: undefined,
			};
			const converted = convertToBasePropertyType(property);
			const expected: TelemetryEventPropertyTypeExt = "{}";
			assert.deepStrictEqual(converted, expected);
		});
	});
	// Note the "as any" required in each of these cases.
	// These are unexpected, but it's good to have coverage to ensure they behave "well enough"
	// (e.g. they shouldn't crash)
	describe("Check various invalid (per typings) cases", () => {
		it("nested Tagged<TelemetryEventPropertyTypeExt>", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				value: { value: true, tag: "tag" } as TelemetryEventPropertyTypeExt,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: '{"value":true,"tag":"tag"}',
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("nested non Tagged<TelemetryEventPropertyTypeExt>", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				value: { foo: 3, bar: { x: 5 } as unknown } as TelemetryEventPropertyTypeExt,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: '{"foo":3,"bar":{"x":5}}',
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("tagged function", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				value: function x() {
					return 54;
				} as unknown as TelemetryEventPropertyTypeExt,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: "INVALID PROPERTY (typed as function)",
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("tagged null value", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				// eslint-disable-next-line unicorn/no-null
				value: null as unknown as TelemetryEventPropertyTypeExt,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: "null",
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("tagged symbol", () => {
			const taggedProperty: Tagged<TelemetryEventPropertyTypeExt> = {
				value: Symbol("Test") as unknown as TelemetryEventPropertyTypeExt,
				tag: "tag",
			};
			const converted = convertToBasePropertyType(taggedProperty);
			const expected: Tagged<TelemetryEventPropertyTypeExt> = {
				value: "INVALID PROPERTY (typed as symbol)",
				tag: "tag",
			};
			assert.deepStrictEqual(converted, expected);
		});
		it("nested object", () => {
			const nestedObject = {
				foo: { foo: true, test: "test" },
				test: "test",
			};
			const converted = convertToBasePropertyType(
				nestedObject as unknown as
					| TelemetryEventPropertyTypeExt
					| Tagged<TelemetryEventPropertyTypeExt>,
			);
			const expected = '{"foo":{"foo":true,"test":"test"},"test":"test"}';
			assert.deepStrictEqual(converted, expected);
		});
		it("function", () => {
			const converted = convertToBasePropertyType(function x() {
				return 54;
			} as unknown as TelemetryEventPropertyTypeExt | Tagged<TelemetryEventPropertyTypeExt>);
			const expected = "INVALID PROPERTY (typed as function)";
			assert.deepStrictEqual(converted, expected);
		});
		it("null", () => {
			const converted = convertToBasePropertyType(
				// eslint-disable-next-line unicorn/no-null
				null as unknown as
					| TelemetryEventPropertyTypeExt
					| Tagged<TelemetryEventPropertyTypeExt>,
			);
			const expected = "null";
			assert.deepStrictEqual(converted, expected);
		});
		it("symbol", () => {
			const converted = convertToBasePropertyType(
				Symbol("Test") as unknown as
					| TelemetryEventPropertyTypeExt
					| Tagged<TelemetryEventPropertyTypeExt>,
			);
			const expected = "INVALID PROPERTY (typed as symbol)";
			assert.deepStrictEqual(converted, expected);
		});
	});
});

describe.only("LogLevelValue-based sampling", () => {
	/**
	 * Example implementation of ITelemetryBaseLogger that uses LogLevelValue
	 * to filter events. Events with a logLevel below the configured sampling
	 * threshold are dropped; the rest are kept.
	 */
	class ExampleSamplingLogger implements ITelemetryBaseLogger {
		public events: ITelemetryBaseEvent[] = [];

		public constructor(
			private readonly samplingThreshold: LogLevelValue = LogLevelValue.essential,
		) {}

		public send(event: ITelemetryBaseEvent): void {
			const eventLogLevel = (event.logLevel as number) ?? LogLevelValue.essential;
			if (eventLogLevel >= this.samplingThreshold) {
				this.events.push(event);
			}
		}
	}

	it("filters events by logLevel when using the default (essential) threshold", () => {
		const baseLogger = new ExampleSamplingLogger();
		const childLogger = createChildLogger({ logger: baseLogger });

		// Send events at each log level, plus one with no level specified
		childLogger.sendTelemetryEvent({
			eventName: "VerboseEvent",
			logLevel: LogLevelValue.verbose,
		});
		childLogger.sendTelemetryEvent({
			eventName: "InfoEvent",
			logLevel: LogLevelValue.info,
		});
		childLogger.sendTelemetryEvent({
			eventName: "EssentialEvent",
			logLevel: LogLevelValue.essential,
		});
		childLogger.sendTelemetryEvent({ eventName: "DefaultLevelEvent" });

		// With the default threshold (essential), only essential-and-above events are kept
		assert.strictEqual(
			baseLogger.events.length,
			2,
			"Only essential-level events should be logged",
		);
		assert.strictEqual(baseLogger.events[0].eventName, "EssentialEvent");
		assert.strictEqual(baseLogger.events[1].eventName, "DefaultLevelEvent");
	});

	it("allows more events through with a lower sampling threshold", () => {
		const baseLogger = new ExampleSamplingLogger(LogLevelValue.info);
		const childLogger = createChildLogger({ logger: baseLogger });

		childLogger.sendTelemetryEvent({
			eventName: "VerboseEvent",
			logLevel: LogLevelValue.verbose,
		});
		childLogger.sendTelemetryEvent({
			eventName: "InfoEvent",
			logLevel: LogLevelValue.info,
		});
		childLogger.sendTelemetryEvent({
			eventName: "EssentialEvent",
			logLevel: LogLevelValue.essential,
		});
		childLogger.sendTelemetryEvent({ eventName: "DefaultLevelEvent" });

		// With an info threshold, verbose is dropped but info and essential are kept
		assert.strictEqual(
			baseLogger.events.length,
			3,
			"Info-level and above events should be logged",
		);
		assert.strictEqual(baseLogger.events[0].eventName, "InfoEvent");
		assert.strictEqual(baseLogger.events[1].eventName, "EssentialEvent");
		assert.strictEqual(baseLogger.events[2].eventName, "DefaultLevelEvent");
	});
});

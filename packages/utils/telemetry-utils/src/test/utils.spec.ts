/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ConfigTypes,
	IConfigProviderBase,
	ITelemetryBaseEvent,
} from "@fluidframework/core-interfaces";

import { mixinMonitoringContext } from "../config.js";
import { TelemetryDataTag, tagCodeArtifacts, tagData } from "../logger.js";
import type { ITelemetryGenericEventExt, ITelemetryLoggerExt } from "../telemetryTypes.js";
import { type IEventSampler, createSampledLogger } from "../utils.js";

describe("tagData", () => {
	it("tagData with data", () => {
		const taggedData = tagData(TelemetryDataTag.CodeArtifact, { foo: "bar" });
		const expected: typeof taggedData = {
			foo: {
				value: "bar",
				tag: TelemetryDataTag.CodeArtifact,
			},
		};
		assert.deepStrictEqual(taggedData, expected);
	});
	it("tagData with undefined", () => {
		const taggedData = tagData(TelemetryDataTag.CodeArtifact, { none: undefined });
		const expected: Partial<typeof taggedData> = {};
		assert.deepStrictEqual(taggedData, expected);
	});

	it("tagData with complex object", () => {
		const taggedData = tagData(TelemetryDataTag.CodeArtifact, {
			foo: "bar",
			none: undefined,
			number: 0,
		});
		const expected: Partial<typeof taggedData> = {
			foo: {
				value: "bar",
				tag: TelemetryDataTag.CodeArtifact,
			},
			number: {
				value: 0,
				tag: TelemetryDataTag.CodeArtifact,
			},
		};

		assert.deepEqual(taggedData, expected);
	});
});

describe("Sampling", () => {
	let events: (ITelemetryBaseEvent | ITelemetryGenericEventExt)[] = [];

	function getMockLoggerExtWithConfig(
		configDictionary?: Record<string, ConfigTypes>,
	): ITelemetryLoggerExt {
		const logger: ITelemetryLoggerExt = {
			send(event: ITelemetryBaseEvent): void {
				events.push(event);
			},
			sendTelemetryEvent: (event) => {
				events.push(event);
			},
			sendErrorEvent: (event) => {
				events.push(event);
			},
			sendPerformanceEvent: (event) => {
				events.push(event);
			},
		};

		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});

		return mixinMonitoringContext(logger, configProvider(configDictionary ?? {})).logger;
	}

	/**
	 * Creates an event sampler that uses a systematic approach to sampling (Sampling every nth event)
	 */
	function createSystematicEventSampler(options: { samplingRate: number }): IEventSampler {
		let eventCount = -1;
		return {
			sample: (): boolean => {
				eventCount++;
				const shouldSample = eventCount % options.samplingRate === 0;
				if (shouldSample) {
					eventCount = 0;
				}
				return shouldSample;
			},
		};
	}

	beforeEach(() => {
		events = [];
	});

	it("Events are not sampled if DisableSampling telemetry flag is set to true", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": true,
		};
		const logger = getMockLoggerExtWithConfig(injectedSettings);

		const loggerWithoutSampling = createSampledLogger(
			logger,
			createSystematicEventSampler({ samplingRate: 1 }),
		);
		const loggerWithEvery5Sampling = createSampledLogger(
			logger,
			createSystematicEventSampler({ samplingRate: 5 }),
		);

		const totalEventCount = 15;
		for (let i = 0; i < totalEventCount; i++) {
			loggerWithoutSampling.send({ category: "generic", eventName: "noSampling" });
			loggerWithEvery5Sampling.send({ category: "generic", eventName: "oneEveryFive" });
		}
		assert.equal(
			events.filter((event) => event.eventName === "noSampling").length,
			totalEventCount,
		);
		assert.equal(
			events.filter((event) => event.eventName === "oneEveryFive").length,
			totalEventCount,
		);
	});

	it("Events are not sampled if DisableSampling telemetry flag is set to true and no sampler is provided", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": true,
		};
		const logger = getMockLoggerExtWithConfig(injectedSettings);

		// Sampling is enabled AND there was no sampler provided
		const loggerWithoutSampling = createSampledLogger(logger);

		const totalEventCount = 15;
		for (let i = 0; i < totalEventCount; i++) {
			loggerWithoutSampling.send({ category: "generic", eventName: "noSampling" });
		}
		assert.equal(
			events.filter((event) => event.eventName === "noSampling").length,
			totalEventCount,
		);
	});

	it("Events are not sampled if DisableSampling telemetry flag is set to false but no sampler is provided", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": false,
		};
		const logger = getMockLoggerExtWithConfig(injectedSettings);

		// Sampling is enabled however there was no sampler provided so all events will be sent.
		const loggerWithoutSampling = createSampledLogger(logger);

		const totalEventCount = 15;
		for (let i = 0; i < totalEventCount; i++) {
			loggerWithoutSampling.send({ category: "generic", eventName: "noSampling" });
		}
		assert.equal(
			events.filter((event) => event.eventName === "noSampling").length,
			totalEventCount,
		);
	});

	it("Events are not logged if DisableSampling telemetry flag is set to true but skipLoggingWhenSamplingIsDisabled is provided as true", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": true,
		};
		const logger = getMockLoggerExtWithConfig(injectedSettings);

		const loggerWithoutSampling = createSampledLogger(
			logger,
			createSystematicEventSampler({ samplingRate: 1 }),
			true, // skipLoggingWhenSamplingIsDisabled
		);
		const loggerWithEvery5Sampling = createSampledLogger(
			logger,
			createSystematicEventSampler({ samplingRate: 5 }),
			true, // skipLoggingWhenSamplingIsDisabled
		);

		const totalEventCount = 15;
		for (let i = 0; i < totalEventCount; i++) {
			loggerWithoutSampling.send({ category: "generic", eventName: "noSampling" });
			loggerWithEvery5Sampling.send({ category: "generic", eventName: "oneEveryFive" });
		}
		assert.equal(
			events.filter((event) => event.eventName === "noSampling").length,
			0,
			"skipLoggingWhenSamplingIsDisabled flag was not honored by loggerWithoutSampling",
		);
		assert.equal(
			events.filter((event) => event.eventName === "oneEveryFive").length,
			0,
			"skipLoggingWhenSamplingIsDisabled flag was not honored by loggerWithEvery5Sampling",
		);
	});

	it("Systematic Sampling works as expected", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": false,
		};
		const logger = getMockLoggerExtWithConfig(injectedSettings);

		const loggerWithoutSampling = createSampledLogger(
			logger,
			createSystematicEventSampler({ samplingRate: 1 }),
		);
		const loggerWithEvery3Sampling = createSampledLogger(
			logger,
			createSystematicEventSampler({ samplingRate: 3 }),
		);
		const loggerWithEvery5Sampling = createSampledLogger(
			logger,
			createSystematicEventSampler({ samplingRate: 5 }),
		);

		const totalEventCount = 15;
		for (let i = 0; i < totalEventCount; i++) {
			loggerWithoutSampling.send({ category: "generic", eventName: "noSampling" });
			loggerWithEvery3Sampling.send({ category: "generic", eventName: "oneEveryThree" });
			loggerWithEvery5Sampling.send({ category: "generic", eventName: "oneEveryFive" });
		}

		assert.equal(
			events.filter((event) => event.eventName === "noSampling").length,
			totalEventCount,
		);
		assert.equal(
			events.filter((event) => event.eventName === "oneEveryThree").length,
			totalEventCount / 3,
		);
		assert.equal(
			events.filter((event) => event.eventName === "oneEveryFive").length,
			totalEventCount / 5,
		);
	});

	it("Event Sampler works as expected with externally controlled state", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": false,
		};
		const logger = getMockLoggerExtWithConfig(injectedSettings);

		interface ExampleEvent extends ITelemetryBaseEvent {
			eventNumber: number;
			appNumber1: number;
			appNumber2: number;
			appBoolean1: boolean;
			appModeString: string;
		}

		let exampleAppDataNumber1 = 0;
		let exampleAppDataNumber2 = 10;
		let exampleAppDataBoolean1 = true;
		let exampleAppDataModeString = "ready";

		const shouldSampleEvent = (
			appNumber1: number,
			appNumber2: number,
			appBoolean1: boolean,
			appMode: string,
		): boolean => {
			const shouldSample =
				appNumber1 < 1 && appNumber2 > 1 && appBoolean1 === true && appMode === "ready";

			return shouldSample;
		};

		const customEventSampler: IEventSampler = {
			sample: () =>
				shouldSampleEvent(
					exampleAppDataNumber1,
					exampleAppDataNumber2,
					exampleAppDataBoolean1,
					exampleAppDataModeString,
				),
		};

		const loggerWithSampling = createSampledLogger(logger, customEventSampler);

		const totalEventCount = 20;
		const eventName = "testEvent";
		for (let i = 0; i < totalEventCount; i++) {
			if (i % 2 === 0) {
				// These values should cause events to be emitted (sampler returns false)
				exampleAppDataNumber1 = -10;
				exampleAppDataNumber2 = 2;
				exampleAppDataBoolean1 = true;
				exampleAppDataModeString = "ready";
			} else {
				//  These values should cause events to not be emitted (sampler returns true)
				exampleAppDataNumber1 = 0;
				exampleAppDataNumber2 = 10;
				exampleAppDataBoolean1 = true;
				exampleAppDataModeString = "not_ready";
			}

			loggerWithSampling.send({
				category: "generic",
				eventName,
				eventNumber: i,
				appNumber1: exampleAppDataNumber1,
				appNumber2: exampleAppDataNumber2,
				appBoolean1: exampleAppDataBoolean1,
				appModeString: exampleAppDataModeString,
			});
		}

		const emittedEvents = events.filter((event) => event.eventName === eventName);
		assert.equal(emittedEvents.length === 10, true);
		for (const event of emittedEvents) {
			const typedEvent = event as ExampleEvent;
			assert.equal(
				shouldSampleEvent(
					typedEvent.appNumber1,
					typedEvent.appNumber2,
					typedEvent.appBoolean1,
					typedEvent.appModeString,
				),
				true,
			);
		}
	});
});

describe("tagCodeArtifacts", () => {
	it("tagCodeArtifacts with undefined", () => {
		const taggedData = tagCodeArtifacts({ node: undefined });
		const expected: Partial<typeof taggedData> = {};
		assert.deepStrictEqual(taggedData, expected, "undefined not tagged as expected");
	});

	it("tagCodeArtifacts with TelemetryBaseEventPropertyType properties", () => {
		const taggedData = tagCodeArtifacts({
			string: "foo",
			number: 0,
			boolean: true,
			none: undefined,
		});
		const expected: Partial<typeof taggedData> = {
			string: {
				value: "foo",
				tag: TelemetryDataTag.CodeArtifact,
			},
			number: {
				value: 0,
				tag: TelemetryDataTag.CodeArtifact,
			},
			boolean: {
				value: true,
				tag: TelemetryDataTag.CodeArtifact,
			},
		};
		assert.deepStrictEqual(
			taggedData,
			expected,
			"TelemetryBaseEventPropertyType not tagged as expected",
		);
	});

	it("tagCodeArtifacts with TelemetryBaseEventPropertyType getters", () => {
		const taggedData = tagCodeArtifacts({
			string: () => "foo",
			number: () => 0,
			boolean: () => true,
		});
		const stringValue = taggedData.string();
		const numberValue = taggedData.number();
		const booleanValue = taggedData.boolean();

		assert.deepStrictEqual(
			stringValue,
			{
				tag: TelemetryDataTag.CodeArtifact,
				value: "foo",
			},
			"string getter not tagged as expected",
		);
		assert.deepStrictEqual(
			numberValue,
			{
				tag: TelemetryDataTag.CodeArtifact,
				value: 0,
			},
			"number getter not tagged as expected",
		);
		assert.deepStrictEqual(
			booleanValue,
			{
				tag: TelemetryDataTag.CodeArtifact,
				value: true,
			},
			"boolean getter not tagged as expected",
		);
	});

	it("tagCodeArtifacts with both TelemetryBaseEventPropertyType properties and getters", () => {
		const expectedStringValue = {
			tag: TelemetryDataTag.CodeArtifact,
			value: "foo",
		};
		const expectedNumberValue = {
			tag: TelemetryDataTag.CodeArtifact,
			value: 0,
		};
		const expectedBooleanValue = {
			tag: TelemetryDataTag.CodeArtifact,
			value: true,
		};

		const taggedData = tagCodeArtifacts({
			string: "foo",
			number: 0,
			boolean: true,
			stringGetter: () => "foo",
			numberGetter: () => 0,
			booleanGetter: () => true,
		});

		// Validate basic properties are tagged.
		assert.deepStrictEqual(
			taggedData.string,
			expectedStringValue,
			"string property not tagged as expected",
		);
		assert.deepStrictEqual(
			taggedData.number,
			expectedNumberValue,
			"number property not tagged as expected",
		);
		assert.deepStrictEqual(
			taggedData.boolean,
			expectedBooleanValue,
			"boolean property not tagged as expected",
		);

		// Validate getters are tagged.
		const stringValue = taggedData.stringGetter();
		const numberValue = taggedData.numberGetter();
		const booleanValue = taggedData.booleanGetter();
		assert.deepStrictEqual(
			stringValue,
			expectedStringValue,
			"string getter not tagged as expected",
		);
		assert.deepStrictEqual(
			numberValue,
			expectedNumberValue,
			"number getter not tagged as expected",
		);
		assert.deepStrictEqual(
			booleanValue,
			expectedBooleanValue,
			"boolean getter not tagged as expected",
		);
	});
});

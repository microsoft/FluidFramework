/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	createSampledLogger,
	// createSystematicSamplingCallback,
	// logIfFalse
} from "../utils";
// import { TelemetryDataTag, tagData } from "../logger";
import { ConfigTypes, IConfigProviderBase, mixinMonitoringContext } from "../config";

// class TestLogger implements ITelemetryBaseLogger {
// 	send(event: ITelemetryBaseEvent): void {
// 		this.events.push(event);
// 	}
// 	public readonly events: ITelemetryBaseEvent[] = [];
// }

// describe("logIfFalse", () => {
// 	it("logIfFalse undefined value is not undefined", () => {
// 		const logger = new TestLogger();
// 		const somthing: number | undefined = undefined;
// 		const val = logIfFalse(somthing !== undefined, logger, "it's undefined");
// 		assert.strictEqual(val, false);
// 		assert.strictEqual(logger.events.length, 1);
// 	});
// 	it("logIfFalse value is not undefined", () => {
// 		const logger = new TestLogger();
// 		const somthing: number | undefined = 1;
// 		const val = logIfFalse(somthing !== undefined, logger, "it's undefined");
// 		assert.strictEqual(val, true);
// 		assert.strictEqual(logger.events.length, 0);
// 	});
// });

// describe("tagData", () => {
// 	it("tagData with data", () => {
// 		const taggedData = tagData(TelemetryDataTag.CodeArtifact, { foo: "bar" });
// 		const expected: typeof taggedData = {
// 			foo: {
// 				value: "bar",
// 				tag: TelemetryDataTag.CodeArtifact,
// 			},
// 		};
// 		assert.deepStrictEqual(taggedData, expected);
// 	});
// 	it("tagData with undefined", () => {
// 		const taggedData = tagData(TelemetryDataTag.CodeArtifact, { none: undefined });
// 		const expected: Partial<typeof taggedData> = {};
// 		assert.deepStrictEqual(taggedData, expected);
// 	});

// 	it("tagData with complex object", () => {
// 		const taggedData = tagData(TelemetryDataTag.CodeArtifact, {
// 			foo: "bar",
// 			none: undefined,
// 			number: 0,
// 		});
// 		const expected: Partial<typeof taggedData> = {
// 			foo: {
// 				value: "bar",
// 				tag: TelemetryDataTag.CodeArtifact,
// 			},
// 			number: {
// 				value: 0,
// 				tag: TelemetryDataTag.CodeArtifact,
// 			},
// 		};

// 		assert.deepEqual(taggedData, expected);
// 	});
// });

describe("Sampling", () => {
	let events: ITelemetryBaseEvent[] = [];
	function getBaseLoggerWithConfig(
		configDictionary?: Record<string, ConfigTypes>,
	): ITelemetryBaseLogger {
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				events.push(event);
			},
		};
		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});
		return mixinMonitoringContext(logger, configProvider(configDictionary ?? {})).logger;
	}

	beforeEach(() => {
		events = [];
	});

	// it("Systematic Sampling works as expected", () => {
	// 	const injectedSettings = {
	// 		"Fluid.Telemetry.DisableSampling": true,
	// 	};
	// 	const logger = getBaseLoggerWithConfig(injectedSettings);

	// 	const loggerWithoutSampling = createSampledLoggerSend(
	// 		logger,
	// 		createSystematicSamplingCallback(1),
	// 	);
	// 	const loggerWithEvery3Sampling = createSampledLoggerSend(
	// 		logger,
	// 		createSystematicSamplingCallback(3),
	// 	);
	// 	const loggerWithEvery5Sampling = createSampledLoggerSend(
	// 		logger,
	// 		createSystematicSamplingCallback(5),
	// 	);

	// 	const totalEventCount = 15;
	// 	for (let i = 0; i < totalEventCount; i++) {
	// 		loggerWithoutSampling.send({ category: "generic", eventName: "noSampling" });
	// 		loggerWithEvery3Sampling.send({ category: "generic", eventName: "oneEveryThree" });
	// 		loggerWithEvery5Sampling.send({ category: "generic", eventName: "oneEveryFive" });
	// 	}

	// 	assert.equal(
	// 		events.filter((event) => event.eventName === "noSampling").length,
	// 		totalEventCount,
	// 	);
	// 	assert.equal(events.filter((event) => event.eventName === "oneEveryThree").length, 5);
	// 	assert.equal(events.filter((event) => event.eventName === "oneEveryFive").length, 3);
	// });

	it("Complex Sampling works as expected", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": true,
		};
		const logger = getBaseLoggerWithConfig(injectedSettings);

		interface ExampleEvent extends ITelemetryBaseEvent {
			eventNumber: number;
			appNumber1: number;
			appNumber2: number;
			appBoolean1: boolean;
			appMode: string;
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
		) => {
			const shouldSample =
				appNumber1 < 1 && appNumber2 > 1 && appBoolean1 === true && appMode === "ready";

			return shouldSample;
		};

		const loggerWithSampling = createSampledLogger(logger, () =>
			shouldSampleEvent(
				exampleAppDataNumber1,
				exampleAppDataNumber2,
				exampleAppDataBoolean1,
				exampleAppDataModeString,
			),
		);

		const totalEventCount = 20;
		for (let i = 0; i < totalEventCount; i++) {
			if (i > 0 && i % 2 === 0) {
				// This will be sampled
				exampleAppDataNumber1 = -10;
				exampleAppDataNumber2 = 2;
				exampleAppDataBoolean1 = true;
				exampleAppDataModeString = "ready";
			} else {
				// This will not be sampled
				exampleAppDataNumber1 = 0;
				exampleAppDataNumber2 = 10;
				exampleAppDataBoolean1 = true;
				exampleAppDataModeString = "not_ready";
			}

			loggerWithSampling.send({
				category: "generic",
				eventName: "testEvent",
				eventNumber: i,
				appNumber1: exampleAppDataNumber1,
				appNumber2: exampleAppDataNumber2,
				appBoolean1: exampleAppDataBoolean1,
				appModeString: exampleAppDataModeString,
			});
		}

		assert.equal(events.length === 10, true);
		for (const event of events) {
			const typedEvent = event as ExampleEvent;
			assert.equal(
				shouldSampleEvent(
					typedEvent.appNumber1,
					typedEvent.appNumber2,
					typedEvent.appBoolean1,
					typedEvent.appMode,
				),
				true,
			);
		}
	});
});

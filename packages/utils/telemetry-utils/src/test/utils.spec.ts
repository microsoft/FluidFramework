/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { createSampledLoggerSend, createSystematicSamplingCallback, logIfFalse } from "../utils";
import { TelemetryDataTag, tagData } from "../logger";
import { ConfigTypes, IConfigProviderBase, mixinMonitoringContext } from "../config";

class TestLogger implements ITelemetryBaseLogger {
	send(event: ITelemetryBaseEvent): void {
		this.events.push(event);
	}
	public readonly events: ITelemetryBaseEvent[] = [];
}

describe("logIfFalse", () => {
	it("logIfFalse undefined value is not undefined", () => {
		const logger = new TestLogger();
		const somthing: number | undefined = undefined;
		const val = logIfFalse(somthing !== undefined, logger, "it's undefined");
		assert.strictEqual(val, false);
		assert.strictEqual(logger.events.length, 1);
	});
	it("logIfFalse value is not undefined", () => {
		const logger = new TestLogger();
		const somthing: number | undefined = 1;
		const val = logIfFalse(somthing !== undefined, logger, "it's undefined");
		assert.strictEqual(val, true);
		assert.strictEqual(logger.events.length, 0);
	});
});

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

	it("Systematic Sampling works as expected", () => {
		const injectedSettings = {
			"Fluid.Telemetry.DisableSampling": true,
		};
		const logger = getBaseLoggerWithConfig(injectedSettings);

		const logAllEvents = createSampledLoggerSend(logger, createSystematicSamplingCallback(1));
		const logEveryThirdEvents = createSampledLoggerSend(
			logger,
			createSystematicSamplingCallback(3),
		);
		const logEvery5thEvent = createSampledLoggerSend(
			logger,
			createSystematicSamplingCallback(5),
		);

		const totalEventCount = 15;
		for (let i = 0; i < totalEventCount; i++) {
			logAllEvents({ category: "generic", eventName: "noSampling" });
			logEveryThirdEvents({ category: "generic", eventName: "oneEveryThree" });
			logEvery5thEvent({ category: "generic", eventName: "oneEveryFive" });
		}

		assert.equal(
			events.filter((event) => event.eventName === "noSampling").length,
			totalEventCount,
		);
		assert.equal(events.filter((event) => event.eventName === "oneEveryThree").length, 5);
		assert.equal(events.filter((event) => event.eventName === "oneEveryFive").length, 3);
	});
});

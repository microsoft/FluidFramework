/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ChildLogger, SamplingConfig, SamplingStrategy, createChildLogger } from "../logger";
import { ConfigTypes, IConfigProviderBase, mixinMonitoringContext } from "../config";

describe("ChildLogger", () => {
	it("Properties & Getters Propagate", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.testProperty !== true || event.testGetter !== true) {
					throw new Error("expected testProperty and testGetter on event");
				}
				sent = true;
			},
		};
		const childLogger1 = ChildLogger.create(logger, "test1", {
			all: {
				testProperty: true,
				testGetter: () => true,
			},
		});

		childLogger1.send({ category: "generic", eventName: "test1" });
		assert(sent, "event should be sent");

		sent = false;
		const childLogger2 = createChildLogger({ logger: childLogger1, namespace: "test2" });

		childLogger2.send({ category: "generic", eventName: "test2" });
		assert(sent, "event should be sent");
	});

	it("Undefined initial Properties and Getter", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.testProperty !== true || event.testGetter !== true) {
					throw new Error("expected testProperty and testGetter on event");
				}
				if (event.eventName !== "test1:test2:testEvent") {
					throw new Error("expected combined namespace");
				}
				sent = true;
			},
		};
		const childLogger1 = createChildLogger({ logger, namespace: "test1" });

		sent = false;
		const childLogger2 = ChildLogger.create(childLogger1, "test2", {
			all: {
				testProperty: true,
				testGetter: () => true,
			},
		});

		childLogger2.send({ category: "generic", eventName: "testEvent" });
		assert(sent, "event should be sent");
	});

	it("Properties Are Combined", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.testProperty1 !== true || event.testProperty2 !== true) {
					throw new Error("expected testProperty1 and testProperty2 on event");
				}
				if (event.eventName !== "test1:test2:testEvent") {
					throw new Error("expected combined namespace");
				}
				sent = true;
			},
		};
		const childLogger1 = ChildLogger.create(logger, "test1", {
			all: {
				testProperty1: true,
			},
		});

		const childLogger2 = ChildLogger.create(childLogger1, "test2", {
			all: {
				testProperty2: true,
			},
		});

		childLogger2.send({ category: "generic", eventName: "testEvent" });
		assert(sent, "event should be sent");
	});

	it("Getters Are Combined", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.testGetter1 !== true || event.testGetter2 !== true) {
					throw new Error("expected testGetter1 and testGetter2 on event");
				}
				if (event.eventName !== "test1:test2:testEvent") {
					throw new Error("expected combined namespace");
				}
				sent = true;
			},
		};
		const childLogger1 = ChildLogger.create(logger, "test1", {
			all: {
				testGetter1: () => true,
			},
		});

		const childLogger2 = ChildLogger.create(childLogger1, "test2", {
			all: {
				testGetter2: () => true,
			},
		});

		childLogger2.send({ category: "generic", eventName: "testEvent" });
		assert(sent, "event should be sent");
	});

	it("Undefined initial namespace", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.eventName !== "test2:testEvent") {
					throw new Error("expected combined namespace");
				}
				sent = true;
			},
		};
		const childLogger1 = createChildLogger({ logger });

		sent = false;
		const childLogger2 = createChildLogger({ logger: childLogger1, namespace: "test2" });

		childLogger2.send({ category: "generic", eventName: "testEvent" });
		assert(sent, "event should be sent");
	});

	it("Undefined second child namespace", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.eventName !== "test1:testEvent") {
					throw new Error("expected combined namespace");
				}
				sent = true;
			},
		};
		const childLogger1 = createChildLogger({ logger, namespace: "test1" });

		sent = false;
		const childLogger2 = createChildLogger({ logger: childLogger1 });

		childLogger2.send({ category: "generic", eventName: "testEvent" });
		assert(sent, "event should be sent");
	});

	it("Undefined namespace", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.eventName !== "testEvent") {
					throw new Error("expected combined namespace");
				}
				sent = true;
			},
		};
		const childLogger1 = createChildLogger({ logger });

		sent = false;
		const childLogger2 = createChildLogger({ logger: childLogger1 });

		childLogger2.send({ category: "generic", eventName: "testEvent" });
		assert(sent, "event should be sent");
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
			const configProvider = (
				settings: Record<string, ConfigTypes>,
			): IConfigProviderBase => ({
				getRawConfig: (name: string): ConfigTypes => settings[name],
			});
			return mixinMonitoringContext(logger, configProvider(configDictionary ?? {})).logger;
		}

		beforeEach(() => {
			events = [];
		});

		it("Applies sampling when feature flag to force unsampled telemetry is not set", () => {
			const eventSamplingConfigs = new Map<string, SamplingConfig>([
				[
					"oneEveryTwo",
					{
						strategy: SamplingStrategy.SYSTEMATIC,
						samplingRate: 2,
					},
				],
				[
					"oneEveryFive",
					{
						strategy: SamplingStrategy.SYSTEMATIC,
						samplingRate: 2,
					},
				],
				[
					"randomChance",
					{
						strategy: SamplingStrategy.RANDOM,
						percentChance: 0.75,
					},
				],
			]);

			const logger = getBaseLoggerWithConfig();
			const childLogger = ChildLogger.create(
				logger,
				undefined,
				undefined,
				eventSamplingConfigs,
			);

			for (let i = 0; i < 15; i++) {
				childLogger.send({ category: "generic", eventName: "noSampling" });
				childLogger.send({ category: "generic", eventName: "oneEveryTwo" });
				childLogger.send({ category: "generic", eventName: "oneEveryFive" });
			}

			const totalEmittedRandomChanceEvents = 1000;
			for (let i = 0; i < totalEmittedRandomChanceEvents; i++) {
				childLogger.send({ category: "generic", eventName: "randomChance" });
			}

			// These counts also validate that we issue sampled events the first time we see them, not only until the specified
			// number of samples have been seen.
			assert.equal(events.filter((event) => event.eventName === "noSampling").length, 15);
			assert.equal(events.filter((event) => event.eventName === "oneEveryTwo").length, 8);
			assert.equal(events.filter((event) => event.eventName === "oneEveryFive").length, 3);
			assert.equal(
				events.filter((event) => event.eventName === "randomChance").length >
					totalEmittedRandomChanceEvents,
				true,
			);
		});

		it("Ignores sampling when feature flag to force unsampled telemetry is set", () => {
			const eventSamplingConfigs = new Map<string, SamplingConfig>([
				[
					"oneEveryTwo",
					{
						strategy: SamplingStrategy.SYSTEMATIC,
						samplingRate: 2,
					},
				],
				[
					"oneEveryFive",
					{
						strategy: SamplingStrategy.SYSTEMATIC,
						samplingRate: 2,
					},
				],
			]);
			const injectedSettings = {
				"Fluid.Telemetry.DisableSampling": true,
			};
			const logger = getBaseLoggerWithConfig(injectedSettings);
			const childLogger = ChildLogger.create(
				logger,
				undefined,
				undefined,
				eventSamplingConfigs,
			);

			for (let i = 0; i < 15; i++) {
				childLogger.send({ category: "generic", eventName: "noSampling" });
				childLogger.send({ category: "generic", eventName: "oneEveryTwo" });
				childLogger.send({ category: "generic", eventName: "oneEveryFive" });
			}

			assert.equal(events.filter((event) => event.eventName === "noSampling").length, 15);
			assert.equal(events.filter((event) => event.eventName === "oneEveryTwo").length, 15);
			assert.equal(events.filter((event) => event.eventName === "oneEveryFive").length, 15);
		});

		it("Random Chance telemetry works as expected", () => {
			const eventSamplingConfigs = new Map<string, SamplingConfig>([
				[
					"randomChanceWith0%",
					{
						strategy: SamplingStrategy.RANDOM,
						percentChance: 0,
					},
				],
				[
					"randomChanceWith75%",
					{
						strategy: SamplingStrategy.RANDOM,
						percentChance: 0.75,
					},
				],

				[
					"randomChanceWith100%",
					{
						strategy: SamplingStrategy.RANDOM,
						percentChance: 1,
					},
				],
			]);

			const logger = getBaseLoggerWithConfig();
			const childLogger = ChildLogger.create(
				logger,
				undefined,
				undefined,
				eventSamplingConfigs,
			);

			const totalEmittedEvents = 50;
			for (let i = 0; i < totalEmittedEvents; i++) {
				childLogger.send({ category: "generic", eventName: "randomChanceWith0%" });
				childLogger.send({ category: "generic", eventName: "randomChanceWith75%" });
				childLogger.send({ category: "generic", eventName: "randomChanceWith100%" });
			}

			// These counts also validate that we issue sampled events the first time we see them, not only until the specified
			// number of samples have been seen.
			assert.equal(
				events.filter((event) => event.eventName === "randomChanceWith0%").length,
				0,
			);
			assert.equal(
				events.filter((event) => event.eventName === "randomChanceWith75%").length > 0,
				true,
			);
			assert.equal(
				events.filter((event) => event.eventName === "randomChanceWith100%").length,
				totalEmittedEvents,
			);
		});
	});
});

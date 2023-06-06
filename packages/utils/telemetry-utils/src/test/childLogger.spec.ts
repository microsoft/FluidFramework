/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "../logger";
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
		const childLogger2 = ChildLogger.create(childLogger1, "test2");

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
		const childLogger1 = ChildLogger.create(logger, "test1");

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
		const childLogger1 = ChildLogger.create(logger);

		sent = false;
		const childLogger2 = ChildLogger.create(childLogger1, "test2");

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
		const childLogger1 = ChildLogger.create(logger, "test1");

		sent = false;
		const childLogger2 = ChildLogger.create(childLogger1);

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
		const childLogger1 = ChildLogger.create(logger);

		sent = false;
		const childLogger2 = ChildLogger.create(childLogger1);

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
			const samplingConfiguration = new Map<string, number>([
				["oneEveryTwo", 2],
				["oneEveryFive", 5],
			]);
			const logger = getBaseLoggerWithConfig();
			const childLogger = ChildLogger.create(
				logger,
				undefined,
				undefined,
				samplingConfiguration,
			);

			for (let i = 0; i < 15; i++) {
				childLogger.send({ category: "generic", eventName: "noSampling" });
				childLogger.send({ category: "generic", eventName: "oneEveryTwo" });
				childLogger.send({ category: "generic", eventName: "oneEveryFive" });
			}

			// These counts also validate that we issue sampled events the first time we see them, not only until the specified
			// number of samples have been seen.
			assert.equal(events.filter((event) => event.eventName === "noSampling").length, 15);
			assert.equal(events.filter((event) => event.eventName === "oneEveryTwo").length, 8);
			assert.equal(events.filter((event) => event.eventName === "oneEveryFive").length, 3);
		});

		it("Ignores sampling when feature flag to force unsampled telemetry is set", () => {
			const samplingConfiguration = new Map<string, number>([
				["oneEveryTwo", 2],
				["oneEveryFive", 5],
			]);
			const injectedSettings = {
				"Fluid.Telemetry.DisableSampling": true,
			};
			const logger = getBaseLoggerWithConfig(injectedSettings);
			const childLogger = ChildLogger.create(
				logger,
				undefined,
				undefined,
				samplingConfiguration,
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
	});
});

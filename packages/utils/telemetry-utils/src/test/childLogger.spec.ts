/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ChildLogger, createChildLogger } from "../logger";
import { ConfigTypes, IConfigProviderBase, mixinMonitoringContext } from "../config";
import { createSampledLoggerSend, createSystematicSamplingCallback } from "../utils";
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

		it("Systematic Sampling works as expected", () => {
			const injectedSettings = {
				"Fluid.Telemetry.DisableSampling": true,
			};
			const logger = getBaseLoggerWithConfig(injectedSettings);

			const logAllEvents = createSampledLoggerSend(
				logger,
				createSystematicSamplingCallback(1),
			);
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
});

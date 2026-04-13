/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
	LogLevel,
} from "@fluidframework/core-interfaces";

import { ChildLogger, createChildLogger, createMultiSinkLogger } from "../logger.js";
import { MockLogger } from "../mockLogger.js";

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

	it("should not send events with log level less than minloglevel", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.eventName !== "testEvent") {
					throw new Error("unexpected event");
				}
				sent = true;
			},

			minLogLevel: LogLevel.error,
		};
		const childLogger1 = createChildLogger({ logger });

		childLogger1.send({ category: "error", eventName: "testEvent" }, LogLevel.error);
		assert(sent, "event should be sent");

		sent = false;
		childLogger1.send({ category: "generic", eventName: "testEvent" }, LogLevel.default);
		assert(!sent, "event should not be sent");
	});

	it("should receive verbose events with min loglevel set as verbose", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.eventName !== "testEvent") {
					throw new Error("unexpected event");
				}
				sent = true;
			},

			minLogLevel: LogLevel.verbose,
		};
		const childLogger1 = createChildLogger({ logger });

		childLogger1.send({ category: "generic", eventName: "testEvent" }, LogLevel.verbose);
		assert(sent, "event should be sent");

		sent = false;
		childLogger1.send({ category: "error", eventName: "testEvent" });
		assert(sent, "default event should be sent");
	});

	it("should not receive verbose events with no min loglevel", () => {
		let sent = false;
		const logger: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.eventName !== "testEvent") {
					throw new Error("unexpected event");
				}
				sent = true;
			},
		};
		const childLogger1 = createChildLogger({ logger });

		childLogger1.send({ category: "error", eventName: "testEvent" });
		assert(sent, "default event should be sent");

		sent = false;
		childLogger1.send({ category: "generic", eventName: "testEvent" }, LogLevel.verbose);
		assert(!sent, "event should not be sent");
	});

	it("should be able to send events correctly according to loglevel if multisink logger is used inside childlogger", () => {
		let sent = false;
		const logger1: ITelemetryBaseLogger = {
			send(event: ITelemetryBaseEvent): void {
				if (event.eventName !== "testEvent") {
					throw new Error("unexpected event");
				}
				sent = true;
			},
			minLogLevel: LogLevel.default,
		};
		const multiSinkLogger = createMultiSinkLogger({
			loggers: [logger1, new MockLogger(LogLevel.error)],
		});
		const childLogger1 = createChildLogger({
			logger: multiSinkLogger,
		});

		childLogger1.send({ category: "generic", eventName: "testEvent" }, LogLevel.verbose);
		assert(!sent, "verbose event should not be sent");

		childLogger1.send({ category: "generic", eventName: "testEvent" }, LogLevel.default);
		assert(sent, "verbose event should be sent");
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LogLevel } from "@fluidframework/core-interfaces";

import { type MultiSinkLogger, createChildLogger, createMultiSinkLogger } from "../logger.js";
import { MockLogger } from "../mockLogger.js";

describe("MultiSinkLogger", () => {
	it("Pushes logs to all sinks", () => {
		const logger1 = new MockLogger();
		const logger2 = new MockLogger();
		const multiSink = createMultiSinkLogger({ loggers: [logger1, logger2] });
		multiSink.sendTelemetryEvent({ eventName: "test" });

		logger1.assertMatch([{ category: "generic", eventName: "test" }]);
		logger2.assertMatch([{ category: "generic", eventName: "test" }]);
	});

	it("Appends namespace to all logged events", () => {
		const logger1 = new MockLogger();
		const logger2 = new MockLogger();
		const multiSink = createMultiSinkLogger({
			loggers: [logger1, logger2],
			namespace: "test",
		});
		multiSink.sendTelemetryEvent({ eventName: "test" });

		logger1.assertMatch([{ category: "generic", eventName: "test:test" }]);
		logger2.assertMatch([{ category: "generic", eventName: "test:test" }]);
	});

	it("Propagates Properties to sinks when tryInheritProperties true", () => {
		const logger1 = new MockLogger();
		const logger2 = new MockLogger();
		const multiSink = createMultiSinkLogger({
			loggers: [
				createChildLogger({ logger: logger1, properties: { all: { test: true } } }),
				logger2,
			],
			tryInheritProperties: true,
		});
		multiSink.sendTelemetryEvent({ eventName: "test" });

		logger1.assertMatch([{ category: "generic", eventName: "test", test: true }]);
		logger2.assertMatch([{ category: "generic", eventName: "test", test: true }]);
	});

	it("Does not Propagates Properties to sinks when tryInheritProperties not set", () => {
		const logger1 = new MockLogger();
		const logger2 = new MockLogger();
		const multiSink = createMultiSinkLogger({
			loggers: [
				createChildLogger({ logger: logger1, properties: { all: { test: true } } }),
				logger2,
			],
		});
		multiSink.sendTelemetryEvent({ eventName: "test" });

		logger1.assertMatch([{ category: "generic", eventName: "test", test: true }]);
		logger2.assertMatch([{ category: "generic", eventName: "test" }]);
	});

	it("MultiSink logger set the logLevel to min logLevel of all loggers", () => {
		const logger1 = new MockLogger(LogLevel.essential);
		const logger2 = new MockLogger(LogLevel.info);
		const multiSink = createMultiSinkLogger({
			loggers: [createChildLogger({ logger: logger1 }), logger2],
		});
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.info,
			"Min loglevel should be set correctly",
		);

		// Add logger with a log level as verbose
		(multiSink as MultiSinkLogger).addLogger(new MockLogger(LogLevel.verbose));
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.verbose,
			"Min loglevel should be set correctly to verbose",
		);
	});

	it("MultiSink logger set the logLevel to essential if not supplied with a log level", () => {
		const logger1 = new MockLogger();
		const logger2 = new MockLogger();
		const multiSink = createMultiSinkLogger({
			loggers: [createChildLogger({ logger: logger1 }), logger2],
		});
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.essential,
			"Min loglevel should be set correctly to essential",
		);
	});

	it("MultiSink logger set the logLevel correctly when no initial loggers are supplied", () => {
		const multiSink = createMultiSinkLogger({
			loggers: [],
		});

		(multiSink as MultiSinkLogger).addLogger(new MockLogger());
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.essential,
			"Min loglevel should be set correctly to essential",
		);

		(multiSink as MultiSinkLogger).addLogger(new MockLogger(LogLevel.info));
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.info,
			"Min loglevel should be set correctly to info",
		);

		(multiSink as MultiSinkLogger).addLogger(new MockLogger(LogLevel.verbose));
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.verbose,
			"Min loglevel should be set correctly to verbose",
		);
	});
});

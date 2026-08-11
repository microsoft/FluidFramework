/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { LogLevel } from "@fluidframework/core-interfaces";

import { type MultiSinkLogger, createChildLogger, createMultiSinkLogger } from "../logger.js";
import { MockLogger } from "../mockLogger.js";

interface RecordedEntry {
	event: ITelemetryBaseEvent;
	logLevel: LogLevel | undefined;
}

function createRecordingSink(minLogLevel: LogLevel = LogLevel.verbose): {
	sink: ITelemetryBaseLogger;
	recorded: RecordedEntry[];
} {
	const recorded: RecordedEntry[] = [];
	const sink: ITelemetryBaseLogger = {
		send: (event, logLevel): void => {
			recorded.push({ event, logLevel });
		},
		minLogLevel,
	};
	return { sink, recorded };
}

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

	it("MultiSink logger set the logLevel to default if not supplied with a log level", () => {
		const logger1 = new MockLogger();
		const logger2 = new MockLogger();
		const multiSink = createMultiSinkLogger({
			loggers: [createChildLogger({ logger: logger1 }), logger2],
		});
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.info,
			"Min loglevel should be set correctly to default",
		);
	});

	it("MultiSink logger set the logLevel correctly when no initial loggers are supplied", () => {
		const multiSink = createMultiSinkLogger({
			loggers: [],
		});

		(multiSink as MultiSinkLogger).addLogger(new MockLogger());
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.info,
			"Min loglevel should be set correctly to default",
		);

		(multiSink as MultiSinkLogger).addLogger(new MockLogger(LogLevel.info));
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.info,
			"Min loglevel should be set correctly to default",
		);

		(multiSink as MultiSinkLogger).addLogger(new MockLogger(LogLevel.verbose));
		assert.strictEqual(
			multiSink.minLogLevel,
			LogLevel.verbose,
			"Min loglevel should be set correctly to verbose",
		);
	});

	describe("logLevel propagation", () => {
		it("Forwards LogLevel.essential to every sink when `sendTelemetryEvent` omits logLevel", () => {
			const { sink: sinkA, recorded: recordedA } = createRecordingSink();
			const { sink: sinkB, recorded: recordedB } = createRecordingSink();
			const multiSink = createMultiSinkLogger({ loggers: [sinkA, sinkB] });

			multiSink.sendTelemetryEvent({ eventName: "noLogLevel" });

			assert.strictEqual(recordedA[0]?.logLevel, LogLevel.essential);
			assert.strictEqual(recordedB[0]?.logLevel, LogLevel.essential);
		});

		it("Forwards LogLevel.essential to every sink when `sendPerformanceEvent` omits logLevel", () => {
			const { sink: sinkA, recorded: recordedA } = createRecordingSink();
			const { sink: sinkB, recorded: recordedB } = createRecordingSink();
			const multiSink = createMultiSinkLogger({ loggers: [sinkA, sinkB] });

			multiSink.sendPerformanceEvent({ eventName: "perfNoLogLevel" });

			assert.strictEqual(recordedA[0]?.logLevel, LogLevel.essential);
			assert.strictEqual(recordedB[0]?.logLevel, LogLevel.essential);
		});

		it("Forwards LogLevel.essential to every sink for `sendErrorEvent`", () => {
			const { sink: sinkA, recorded: recordedA } = createRecordingSink();
			const { sink: sinkB, recorded: recordedB } = createRecordingSink();
			const multiSink = createMultiSinkLogger({ loggers: [sinkA, sinkB] });

			multiSink.sendErrorEvent({ eventName: "errorEvent" });

			assert.strictEqual(recordedA[0]?.logLevel, LogLevel.essential);
			assert.strictEqual(recordedB[0]?.logLevel, LogLevel.essential);
		});

		for (const explicitLevel of [LogLevel.verbose, LogLevel.info] as const) {
			it(`Forwards explicit logLevel (${explicitLevel}) unchanged through MultiSink to every sink via \`sendTelemetryEvent\``, () => {
				const { sink: sinkA, recorded: recordedA } = createRecordingSink(LogLevel.verbose);
				const { sink: sinkB, recorded: recordedB } = createRecordingSink(LogLevel.verbose);
				const multiSink = createMultiSinkLogger({ loggers: [sinkA, sinkB] });

				multiSink.sendTelemetryEvent({ eventName: "explicit" }, undefined, explicitLevel);

				assert.strictEqual(recordedA[0]?.logLevel, explicitLevel);
				assert.strictEqual(recordedB[0]?.logLevel, explicitLevel);
			});

			it(`Forwards explicit logLevel (${explicitLevel}) unchanged through MultiSink via \`sendPerformanceEvent\``, () => {
				const { sink: sinkA, recorded: recordedA } = createRecordingSink(LogLevel.verbose);
				const { sink: sinkB, recorded: recordedB } = createRecordingSink(LogLevel.verbose);
				const multiSink = createMultiSinkLogger({ loggers: [sinkA, sinkB] });

				multiSink.sendPerformanceEvent(
					{ eventName: "explicitPerf" },
					undefined,
					explicitLevel,
				);

				assert.strictEqual(recordedA[0]?.logLevel, explicitLevel);
				assert.strictEqual(recordedB[0]?.logLevel, explicitLevel);
			});
		}

		it("Forwards explicit logLevel through MultiSink -> [Child(sinkA), sinkB]", () => {
			const { sink: sinkA, recorded: recordedA } = createRecordingSink(LogLevel.verbose);
			const { sink: sinkB, recorded: recordedB } = createRecordingSink(LogLevel.verbose);
			const multiSink = createMultiSinkLogger({
				loggers: [createChildLogger({ logger: sinkA }), sinkB],
			});

			multiSink.sendTelemetryEvent({ eventName: "mixedChain" }, undefined, LogLevel.verbose);

			assert.strictEqual(recordedA[0]?.logLevel, LogLevel.verbose);
			assert.strictEqual(recordedB[0]?.logLevel, LogLevel.verbose);
		});

		it("Regression: `MultiSinkLogger.send` forwards explicit logLevel to every sink (was previously dropped)", () => {
			const { sink: sinkA, recorded: recordedA } = createRecordingSink(LogLevel.verbose);
			const { sink: sinkB, recorded: recordedB } = createRecordingSink(LogLevel.verbose);
			const multiSink = createMultiSinkLogger({
				loggers: [sinkA, sinkB],
			}) as MultiSinkLogger;

			multiSink.send({ category: "generic", eventName: "directSend" }, LogLevel.verbose);

			assert.strictEqual(recordedA[0]?.logLevel, LogLevel.verbose);
			assert.strictEqual(recordedB[0]?.logLevel, LogLevel.verbose);
		});
	});
});

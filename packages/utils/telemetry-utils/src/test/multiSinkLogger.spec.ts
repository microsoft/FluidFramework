/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockLogger } from "@fluidframework/telemetry-utils-previous";
import { createChildLogger, createMultiSinkLogger } from "../logger";

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
		const multiSink = createMultiSinkLogger({ loggers: [logger1, logger2], namespace: "test" });
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
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

import type {
	ITelemetryErrorEventExt,
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "../telemetryTypes.js";
import { ThresholdCounter } from "../thresholdCounter.js";

class FakeTelemetryLogger implements ITelemetryLoggerExt {
	public events: ITelemetryGenericEventExt[] = [];

	public send(_event: ITelemetryBaseEvent): void {
		assert.fail("Should not be called");
	}

	public sendTelemetryEvent(_event: ITelemetryGenericEventExt, _error?: unknown): void {
		assert.fail("Should not be called");
	}

	public sendErrorEvent(_event: ITelemetryErrorEventExt, _error?: unknown): void {
		assert.fail("Should not be called");
	}

	public sendPerformanceEvent(event: ITelemetryPerformanceEventExt, _error?: unknown): void {
		this.events.push(event);
	}
}

describe("ThresholdCounter", () => {
	let logger: FakeTelemetryLogger;
	let sender: ThresholdCounter;
	const threshold = 100;

	beforeEach(() => {
		logger = new FakeTelemetryLogger();
		sender = new ThresholdCounter(threshold, logger);
	});

	it("Send only if it passes threshold", () => {
		sender.send("event_1", threshold);
		sender.send("event_2", threshold + 1);
		sender.send("event_3", threshold - 1);
		sender.send("event_4", 0);

		assert.strictEqual(logger.events.length, 2);
		assert.deepStrictEqual(logger.events[0], { eventName: "event_1", value: threshold });
		assert.deepStrictEqual(logger.events[1], { eventName: "event_2", value: threshold + 1 });
	});

	it("Send only if value is multiple", () => {
		sender.sendIfMultiple("event_1", threshold);
		sender.sendIfMultiple("event_2", threshold * 2);
		sender.sendIfMultiple("event_3", threshold - 1);
		sender.sendIfMultiple("event_4", 0);

		assert.strictEqual(logger.events.length, 2);
		assert.deepStrictEqual(logger.events[0], { eventName: "event_1", value: threshold });
		assert.deepStrictEqual(logger.events[1], { eventName: "event_2", value: threshold * 2 });
	});
});

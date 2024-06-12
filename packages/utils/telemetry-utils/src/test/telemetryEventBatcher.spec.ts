/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

import { IMeasuredCodeResult, TelemetryEventBatcher } from "../telemetryEventBatcher.js";
import {
	type ITelemetryErrorEventExt,
	type ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
} from "../telemetryTypes.js";

/**
 * @remarks Initialized in advance to extract its keys for type checking.
 * Arbitrary properties that can be logged with the telemetry event.
 */
interface TestTelemetryProperties {
	propertyOne: number;
	propertyTwo: number;
	propertyThree: number;
}

/**
 * Test logger with only necessary functionality used by the TelemetryEventBatcher
 */
class TestLogger implements ITelemetryLoggerExt {
	public events: IMeasuredCodeResult<keyof TestTelemetryProperties>[] = [];

	sendPerformanceEvent(
		event: IMeasuredCodeResult<keyof TestTelemetryProperties>,
		error?: unknown,
	): void {
		this.events.push(event);
	}

	send(event: ITelemetryBaseEvent): void {
		throw new Error("Method not implemented.");
	}
	sendTelemetryEvent(event: ITelemetryGenericEventExt, error?: unknown): void {
		throw new Error("Method not implemented.");
	}
	sendErrorEvent(event: ITelemetryErrorEventExt, error?: unknown): void {
		throw new Error("Method not implemented.");
	}
	supportsTags?: true | undefined;
}

describe("TelemetryEventBatcher", () => {
	let logger: TestLogger;

	beforeEach(() => {
		logger = new TestLogger();
	});

	it("only writes event after correct number of samples", () => {
		const threshold = 10;
		const eventBatcher = new TelemetryEventBatcher<keyof TestTelemetryProperties>(
			{ eventName: "testEvent" },
			logger,
			threshold,
		);
	});
});

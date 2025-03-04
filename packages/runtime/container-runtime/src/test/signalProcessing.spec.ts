/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISignalEnvelope } from "@fluidframework/core-interfaces/internal";
import {
	createMockLoggerExt,
	type IMockLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import type { IPerfSignalReport } from "../connectionTelemetry.js";
import { processSignalForTelemetry } from "../signalProcessing.js";

describe("processSignalForTelemetry", () => {
	let signalTracking: IPerfSignalReport;
	let mockLogger: IMockLoggerExt;
	let consecutiveReconnects: number;

	let clock: SinonFakeTimers;

	before(() => {
		clock = useFakeTimers();
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});

	beforeEach(() => {
		signalTracking = {
			totalSignalsSentInLatencyWindow: 10,
			signalsLost: 0,
			signalsOutOfOrder: 0,
			signalsSentSinceLastLatencyMeasurement: 5,
			broadcastSignalSequenceNumber: 100,
			signalTimestamp: 0,
			roundTripSignalSequenceNumber: undefined,
			trackingSignalSequenceNumber: undefined,
			minimumTrackingSignalSequenceNumber: undefined,
		};
		mockLogger = createMockLoggerExt();
		consecutiveReconnects = 3;
	});

	it("should do nothing when clientBroadcastSignalSequenceNumber is undefined", () => {
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, undefined, "no changes to signal tracking should occur");
	});

	it("should do nothing when trackingSignalSequenceNumber is undefined", () => {
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 101,
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, undefined, "no changes to signal tracking should occur");
	});

	it("should do nothing when minimumTrackingSignalSequenceNumber is undefined", () => {
		signalTracking.trackingSignalSequenceNumber = 100;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 101,
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, undefined, "no changes to signal tracking should occur");
	});

	it("should update tracking signal number when receiving expected signal", () => {
		signalTracking.trackingSignalSequenceNumber = 101;
		signalTracking.minimumTrackingSignalSequenceNumber = 100;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 101,
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(
			result,
			{ ...signalTracking, trackingSignalSequenceNumber: 102 },
			"trackingSignalSequenceNumber should be updated",
		);
	});

	it("should detect and report lost signals", () => {
		signalTracking.trackingSignalSequenceNumber = 101;
		signalTracking.minimumTrackingSignalSequenceNumber = 100;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 105, // Skipped signals 101-104
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
		const event = mockLogger.events()[0];
		assert.strictEqual(event.eventName, "SignalLost", "Should log signal lost event");
		const telemetryEventDetails = JSON.parse(event.details as string) as {
			signalsLost: number;
		};
		assert.deepEqual(telemetryEventDetails.signalsLost, 4, "Should report 4 lost signals");

		// Validate signal tracking updates are correct
		assert.deepEqual(
			result,
			{ ...signalTracking, signalsLost: 4, trackingSignalSequenceNumber: 106 },
			"signalsLost and trackingSignalSequenceNumber should be updated",
		);
	});

	it("should detect and report out-of-order signals with container address", () => {
		signalTracking.trackingSignalSequenceNumber = 105;
		signalTracking.minimumTrackingSignalSequenceNumber = 100;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined, // Container address
			clientBroadcastSignalSequenceNumber: 102, // Out of order signal
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
		const event = mockLogger.events()[0];
		assert.strictEqual(event.eventName, "SignalOutOfOrder", "Should log out of order event");
		const telemetryEventDetails = JSON.parse(event.details as string) as {
			contentsType: string | undefined;
		};
		assert.deepEqual(
			telemetryEventDetails.contentsType,
			"test",
			"Should include contents type for container signals",
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(
			result,
			{ ...signalTracking, signalsOutOfOrder: 1 },
			"signalsOutOfOrder should be updated",
		);
	});

	it("should detect and report out-of-order signals with non-container address", () => {
		signalTracking.trackingSignalSequenceNumber = 105;
		signalTracking.minimumTrackingSignalSequenceNumber = 100;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: "dataStore1", // Non-container address
			clientBroadcastSignalSequenceNumber: 102, // Out of order signal
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
		const event = mockLogger.events()[0];
		assert.strictEqual(event.eventName, "SignalOutOfOrder", "Should log out of order event");
		const telemetryEventDetails = JSON.parse(event.details as string) as {
			contentsType: string | undefined;
		};
		assert.deepEqual(
			telemetryEventDetails.contentsType,
			undefined,
			"Should not include contents type for non-container signals",
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(
			result,
			{ ...signalTracking, signalsOutOfOrder: 1 },
			"signalsOutOfOrder should be updated",
		);
	});

	it("should ignore out-of-order signals before minimumTrackingSignalSequenceNumber", () => {
		signalTracking.trackingSignalSequenceNumber = 105;
		signalTracking.minimumTrackingSignalSequenceNumber = 100;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 99, // Before minimum tracking number
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, signalTracking, "no changes to signal tracking should occur");
	});

	it("should report signal latency when roundtrip signal is received", () => {
		signalTracking.trackingSignalSequenceNumber = 102;
		signalTracking.minimumTrackingSignalSequenceNumber = 102;
		signalTracking.roundTripSignalSequenceNumber = 101;

		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 101, // Matches roundTrip sequence number
		};

		clock.tick(500); // Simulate 500ms latency

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
		const event = mockLogger.events()[0];
		assert.strictEqual(event.eventName, "SignalLatency", "Should log latency event");
		const telemetryEventDetails = JSON.parse(event.details as string) as unknown;
		assert.deepEqual(telemetryEventDetails, {
			duration: 500,
			sent: 10,
			lost: 0,
			outOfOrder: 0,
			reconnectCount: 3,
		});

		// Validate signal tracking updates are correct
		assert.deepEqual(
			result,
			{
				...signalTracking,
				signalsLost: 0,
				signalsOutOfOrder: 0,
				totalSignalsSentInLatencyWindow: 0,
				signalTimestamp: 0,
				roundTripSignalSequenceNumber: undefined,
			},
			"signal tracking properties should be updated",
		);
	});

	it("should clear roundTripSignalSequenceNumber when receiving signal with higher sequence number", () => {
		signalTracking.trackingSignalSequenceNumber = 105;
		signalTracking.minimumTrackingSignalSequenceNumber = 105;
		signalTracking.roundTripSignalSequenceNumber = 102;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 103, // Higher than roundTripSignalSequenceNumber
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 0, "No log event should be generated");

		// Validate signal tracking updates are correct
		assert.deepEqual(
			result,
			{ ...signalTracking, roundTripSignalSequenceNumber: undefined },
			"roundTripSignalSequenceNumber should be updated",
		);
	});

	it("should handle multiple conditions in one processing", () => {
		signalTracking.trackingSignalSequenceNumber = 105;
		signalTracking.minimumTrackingSignalSequenceNumber = 100;
		signalTracking.roundTripSignalSequenceNumber = 108;
		const envelope: ISignalEnvelope = {
			contents: { type: "test", content: {} },
			address: undefined,
			clientBroadcastSignalSequenceNumber: 108, // Matches roundTrip and is higher than expected
		};

		const result = processSignalForTelemetry(
			envelope,
			signalTracking,
			mockLogger,
			consecutiveReconnects,
		);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(mockLogger.events().length, 2, "Logger should be called twice");
		const event1 = mockLogger.events()[0];
		assert.strictEqual(event1.eventName, "SignalLost", "Should log signal lost event");
		const event1Details = JSON.parse(event1.details as string) as unknown;
		assert.deepEqual(event1Details, {
			signalsLost: 3,
			clientBroadcastSignalSequenceNumber: 108,
			expectedSequenceNumber: 105,
		});
		const event2 = mockLogger.events()[1];
		assert.strictEqual(event2.eventName, "SignalLatency", "Should log latency event");

		// Validate signal tracking updates are correct
		assert.deepEqual(
			result,
			{
				...signalTracking,
				signalTimestamp: 0,
				trackingSignalSequenceNumber: 109,
				roundTripSignalSequenceNumber: undefined,
				totalSignalsSentInLatencyWindow: 0,
			},
			"properties should be updated",
		);
	});
});

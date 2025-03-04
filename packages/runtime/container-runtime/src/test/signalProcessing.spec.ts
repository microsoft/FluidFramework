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

const getEnvelopeObject = (
	clientBroadcastSignalSequenceNumber: number | undefined,
	address?: string,
): ISignalEnvelope => ({
	contents: { type: "test", content: {} },
	address,
	clientBroadcastSignalSequenceNumber,
});

const getSignalTrackingObject = (
	trackingSignalSequenceNumber?: number,
	minimumTrackingSignalSequenceNumber?: number,
	roundTripSignalSequenceNumber?: number,
): IPerfSignalReport => ({
	totalSignalsSentInLatencyWindow: 10,
	signalsLost: 0,
	signalsOutOfOrder: 0,
	signalsSentSinceLastLatencyMeasurement: 5,
	broadcastSignalSequenceNumber: 100,
	signalTimestamp: 0,
	roundTripSignalSequenceNumber,
	trackingSignalSequenceNumber,
	minimumTrackingSignalSequenceNumber,
});

describe("processSignalForTelemetry", () => {
	let logger: IMockLoggerExt;
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
		logger = createMockLoggerExt();
	});

	it("should do nothing when clientBroadcastSignalSequenceNumber is undefined", () => {
		const signalTracking = getSignalTrackingObject();
		const envelope = getEnvelopeObject(undefined);

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, undefined, "no changes to signal tracking should occur");
	});

	it("should do nothing when trackingSignalSequenceNumber is undefined", () => {
		const signalTracking = getSignalTrackingObject();
		const envelope = getEnvelopeObject(101);

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, undefined, "no changes to signal tracking should occur");
	});

	it("should do nothing when minimumTrackingSignalSequenceNumber is undefined", () => {
		const signalTracking = getSignalTrackingObject(100);
		const envelope = getEnvelopeObject(101);

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, undefined, "no changes to signal tracking should occur");
	});

	it("should update tracking signal number when receiving expected signal", () => {
		const signalTracking = getSignalTrackingObject(101, 100);
		const envelope = getEnvelopeObject(101);

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, { ...signalTracking, trackingSignalSequenceNumber: 102 });
	});

	it("should detect and report lost signals", () => {
		const signalTracking = getSignalTrackingObject(101, 100);
		const envelope = getEnvelopeObject(105); // Skipped signals 102-104

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[{ eventName: "SignalLost", signalsLost: 4 }],
			"Should log signal lost event",
			true,
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(result, {
			...signalTracking,
			signalsLost: 4,
			trackingSignalSequenceNumber: 106,
		});
	});

	it("should detect and report out-of-order signals with container address", () => {
		const signalTracking = getSignalTrackingObject(105, 100);
		const envelope = getEnvelopeObject(102); // Out of order signal

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[{ eventName: "SignalOutOfOrder", contentsType: "test" }],
			"Should log signal out of order event",
			true,
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(result, { ...signalTracking, signalsOutOfOrder: 1 });
	});

	it("should detect and report out-of-order signals with non-container address", () => {
		const signalTracking = getSignalTrackingObject(105, 100);
		const envelope = getEnvelopeObject(102, "dataStore1"); // Out of order signal and non-container address

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[{ eventName: "SignalOutOfOrder", contentsType: undefined }],
			"Should log signal out of order event",
			true,
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(result, { ...signalTracking, signalsOutOfOrder: 1 });
	});

	it("should ignore out-of-order signals before minimumTrackingSignalSequenceNumber", () => {
		const signalTracking = getSignalTrackingObject(105, 100);
		const envelope = getEnvelopeObject(99); // Before minimum tracking number

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, signalTracking, "no changes to signal tracking should occur");
	});

	it("should report signal latency when roundtrip signal is received", () => {
		const signalTracking = getSignalTrackingObject(102, 102, 101);
		const envelope = getEnvelopeObject(101); // Matches roundTrip sequence number

		clock.tick(500); // Simulate 500ms latency

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 3);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[
				{
					eventName: "SignalLatency",
					duration: 500,
					sent: 10,
					lost: 0,
					outOfOrder: 0,
					reconnectCount: 3,
				},
			],
			"Should log signal latency event",
			true,
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(result, {
			...signalTracking,
			signalsLost: 0,
			signalsOutOfOrder: 0,
			totalSignalsSentInLatencyWindow: 0,
			signalTimestamp: 0,
			roundTripSignalSequenceNumber: undefined,
		});
	});

	it("should clear roundTripSignalSequenceNumber when receiving signal with higher sequence number", () => {
		const signalTracking = getSignalTrackingObject(105, 105, 102);
		const envelope = getEnvelopeObject(103); // Higher than roundTripSignalSequenceNumber

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "No log event should be generated");

		// Validate signal tracking updates are correct
		assert.deepEqual(result, { ...signalTracking, roundTripSignalSequenceNumber: undefined });
	});

	it("should handle multiple conditions in one processing", () => {
		const signalTracking = getSignalTrackingObject(105, 100, 108);
		const envelope = getEnvelopeObject(108); // Matches roundTrip and is higher than expected

		const result = processSignalForTelemetry(envelope, signalTracking, logger, 1);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[
				{
					eventName: "SignalLost",
					signalsLost: 3,
					clientBroadcastSignalSequenceNumber: 108,
					expectedSequenceNumber: 105,
				},
				{
					eventName: "SignalLatency",
					duration: 0,
					sent: 10,
					lost: 3,
					outOfOrder: 0,
					reconnectCount: 1,
				},
			],
			"Should log signal lost and signal latency events",
			true,
		);
		// Validate signal tracking updates are correct
		assert.deepEqual(result, {
			...signalTracking,
			signalTimestamp: 0,
			trackingSignalSequenceNumber: 109,
			roundTripSignalSequenceNumber: undefined,
			totalSignalsSentInLatencyWindow: 0,
		});
	});
});

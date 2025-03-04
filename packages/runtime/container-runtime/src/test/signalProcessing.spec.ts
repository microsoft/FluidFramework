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
import { createNewSignalEnvelope, SignalManager } from "../signalProcessing.js";

const getEnvelopeObject = (
	clientBroadcastSignalSequenceNumber: number | undefined,
	address?: string,
): ISignalEnvelope => {
	const envelope = createNewSignalEnvelope(address, "test", {});
	envelope.clientBroadcastSignalSequenceNumber = clientBroadcastSignalSequenceNumber;
	return envelope;
};

const getSignalManager = (
	trackingSignalSequenceNumber?: number,
	minimumTrackingSignalSequenceNumber?: number,
	roundTripSignalSequenceNumber?: number,
): SignalManager => {
	const signalManager = new SignalManager();
	signalManager.resetTracking({
		totalSignalsSentInLatencyWindow: 10,
		signalsLost: 0,
		signalsOutOfOrder: 0,
		signalsSentSinceLastLatencyMeasurement: 5,
		signalTimestamp: 0,
		roundTripSignalSequenceNumber,
		trackingSignalSequenceNumber,
		minimumTrackingSignalSequenceNumber,
	});
	return signalManager;
};

describe("SignalManager.processSignalForTelemetry", () => {
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
		const signalManager = getSignalManager();
		const envelope = getEnvelopeObject(undefined);

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should do nothing when trackingSignalSequenceNumber is undefined", () => {
		const signalManager = getSignalManager();
		const envelope = getEnvelopeObject(101);

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should do nothing when minimumTrackingSignalSequenceNumber is undefined", () => {
		const signalManager = getSignalManager(100);
		const envelope = getEnvelopeObject(101);

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should update tracking signal number when receiving expected signal", () => {
		const signalManager = getSignalManager(101, 100);
		const envelope = getEnvelopeObject(101);

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
			trackingSignalSequenceNumber: 102,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should detect and report lost signals", () => {
		const signalManager = getSignalManager(101, 100);
		const envelope = getEnvelopeObject(105); // Skipped signals 102-104

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
			signalsLost: 4,
			trackingSignalSequenceNumber: 106,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[{ eventName: "SignalLost", signalsLost: 4 }],
			"Should log signal lost event",
			true,
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should detect and report out-of-order signals with container address", () => {
		const signalManager = getSignalManager(105, 100);
		const envelope = getEnvelopeObject(102); // Out of order signal

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
			signalsOutOfOrder: 1,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[{ eventName: "SignalOutOfOrder", contentsType: "test" }],
			"Should log signal out of order event",
			true,
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should detect and report out-of-order signals with non-container address", () => {
		const signalManager = getSignalManager(105, 100);
		const envelope = getEnvelopeObject(102, "dataStore1"); // Out of order signal and non-container address

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
			signalsOutOfOrder: 1,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		logger.internalMockLogger.assertMatchStrict(
			[{ eventName: "SignalOutOfOrder", contentsType: undefined }],
			"Should log signal out of order event",
			true,
		);

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should ignore out-of-order signals before minimumTrackingSignalSequenceNumber", () => {
		const signalManager = getSignalManager(105, 100);
		const envelope = getEnvelopeObject(99); // Before minimum tracking number

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "Logger should not be called");

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should report signal latency when roundtrip signal is received", () => {
		const signalManager = getSignalManager(102, 102, 101);
		const envelope = getEnvelopeObject(101); // Matches roundTrip sequence number

		clock.tick(500); // Simulate 500ms latency

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
			signalsLost: 0,
			signalsOutOfOrder: 0,
			totalSignalsSentInLatencyWindow: 0,
			signalTimestamp: 0,
			roundTripSignalSequenceNumber: undefined,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 3);

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
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should clear roundTripSignalSequenceNumber when receiving signal with higher sequence number", () => {
		const signalManager = getSignalManager(105, 105, 102);
		const envelope = getEnvelopeObject(103); // Higher than roundTripSignalSequenceNumber

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
			roundTripSignalSequenceNumber: undefined,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

		// Validate telemetry events (if any) are correct
		assert.strictEqual(logger.events().length, 0, "No log event should be generated");

		// Validate signal tracking updates are correct
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});

	it("should handle multiple conditions in one processing", () => {
		const signalManager = getSignalManager(105, 100, 108);
		const envelope = getEnvelopeObject(108); // Matches roundTrip and is higher than expected

		const expectedEndState: IPerfSignalReport = {
			...signalManager.signalTrackingState,
			signalTimestamp: 0,
			trackingSignalSequenceNumber: 109,
			roundTripSignalSequenceNumber: undefined,
			totalSignalsSentInLatencyWindow: 0,
		};

		signalManager.processSignalForTelemetry(envelope, logger, 1);

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
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);
	});
});

describe("SignalManager.resetTracking", () => {
	it("resets state correctly", () => {
		const signalManager = getSignalManager();

		// Resets to specific values if provided
		const expectedEndState: IPerfSignalReport = {
			totalSignalsSentInLatencyWindow: 10,
			signalsLost: 20,
			signalsOutOfOrder: 30,
			signalsSentSinceLastLatencyMeasurement: 40,
			broadcastSignalSequenceNumber: 50,
			signalTimestamp: 0,
			roundTripSignalSequenceNumber: undefined,
			trackingSignalSequenceNumber: undefined,
			minimumTrackingSignalSequenceNumber: undefined,
		};
		signalManager.resetTracking(expectedEndState);
		assert.deepEqual(signalManager.signalTrackingState, expectedEndState);

		// Resets to default values if none are provided
		signalManager.resetTracking();
		assert.deepEqual(signalManager.signalTrackingState, {
			totalSignalsSentInLatencyWindow: 0,
			signalsLost: 0,
			signalsOutOfOrder: 0,
			signalsSentSinceLastLatencyMeasurement: 0,
			broadcastSignalSequenceNumber: 50, // This is not reset as part of the state
			signalTimestamp: 0,
			roundTripSignalSequenceNumber: undefined,
			trackingSignalSequenceNumber: undefined,
			minimumTrackingSignalSequenceNumber: undefined,
		});
	});
});

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

describe("Runtime", () => {
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

	describe("processSignalForTelemetry", () => {
		let signalTracking: IPerfSignalReport;
		let mockLogger: IMockLoggerExt;
		let consecutiveReconnects: number;

		type EventDetailsHelperType = Record<
			string,
			string | number | boolean | undefined | (string | number | boolean)[]
		>;

		beforeEach(() => {
			signalTracking = {
				totalSignalsSentInLatencyWindow: 10,
				signalsLost: 0,
				signalsOutOfOrder: 0,
				signalsSentSinceLastLatencyMeasurement: 5,
				broadcastSignalSequenceNumber: 100,
				signalTimestamp: Date.now() - 500, // 500ms ago
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

			assert.strictEqual(
				mockLogger.events.length,
				0,
				"Logger should not be called for expected signal",
			);

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

			assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
			assert.strictEqual(
				mockLogger.events()[0].eventName,
				"SignalLost",
				"Should log signal lost event",
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const actualSignalsLost = JSON.parse(mockLogger.events()[0].details as string)
				.signalsLost as number;
			assert.strictEqual(actualSignalsLost, 4, "Should report 4 lost signals");

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

			assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
			assert.strictEqual(
				mockLogger.events()[0].eventName,
				"SignalOutOfOrder",
				"Should log out of order event",
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const actualContentsType = JSON.parse(mockLogger.events()[0].details as string)
				.contentsType as number;
			assert.strictEqual(
				actualContentsType,
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

			assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
			assert.strictEqual(
				mockLogger.events()[0].eventName,
				"SignalOutOfOrder",
				"Should log out of order event",
			);
			assert.strictEqual(
				(mockLogger.events()[0].details as EventDetailsHelperType).contentsType,
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

			assert.strictEqual(mockLogger.events().length, 0, "Logger should not be called");

			// Validate signal tracking updates are correct
			assert.deepEqual(result, signalTracking, "no changes to signal tracking should occur");
		});

		it("should report signal latency when roundtrip signal is received", () => {
			signalTracking.trackingSignalSequenceNumber = 102;
			signalTracking.minimumTrackingSignalSequenceNumber = 102;
			signalTracking.roundTripSignalSequenceNumber = 101;
			signalTracking.signalTimestamp = Date.now() - 500; // 500ms ago

			const envelope: ISignalEnvelope = {
				contents: { type: "test", content: {} },
				address: undefined,
				clientBroadcastSignalSequenceNumber: 101, // Matches roundTrip sequence number
			};

			const result = processSignalForTelemetry(
				envelope,
				signalTracking,
				mockLogger,
				consecutiveReconnects,
			);

			assert.strictEqual(mockLogger.events().length, 1, "Logger should be called once");
			assert.strictEqual(
				mockLogger.events()[0].eventName,
				"SignalLatency",
				"Should log latency event",
			);

			// Validate details of the telemetry event are expected
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- We know what we expect in the event details
			const {
				duration: actualDuration,
				sent: actualSent,
				lost: actualLost,
				outOfOrder: actualOutOfOrder,
				reconnectCount: actualReconnectCount,
			}: {
				duration: number;
				sent: number;
				lost: number;
				outOfOrder: number;
				reconnectCount: number;
			} = JSON.parse(mockLogger.events()[0].details as string);

			assert.ok(
				actualDuration >= 490 && actualDuration <= 510,
				`Duration should be ~500ms but was ${actualDuration}`,
			);
			assert.strictEqual(actualSent, 10, "Should report sent signals");
			assert.strictEqual(actualLost, 0, "Should report lost signals");
			assert.strictEqual(actualOutOfOrder, 0, "Should report out of order signals");
			assert.strictEqual(actualReconnectCount, 3, "Should report reconnect count");

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

			assert.strictEqual(
				mockLogger.events().length,
				0,
				"Logger should not be called for higher sequence",
			);

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

			assert.strictEqual(mockLogger.events().length, 2, "Logger should be called twice");

			// First event for lost signals
			assert.strictEqual(
				mockLogger.events()[0].eventName,
				"SignalLost",
				"Should log signal lost event",
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- We know what we expect in the event details
			const {
				signalsLost: actualSignalsLost,
			}: {
				signalsLost: number;
			} = JSON.parse(mockLogger.events()[0].details as string);
			assert.strictEqual(actualSignalsLost, 3, "Should report 3 lost signals");

			// Second event for latency
			assert.strictEqual(
				mockLogger.events()[1].eventName,
				"SignalLatency",
				"Should log latency event",
			);

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
});

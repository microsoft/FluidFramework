/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISignalEnvelope } from "@fluidframework/core-interfaces/internal";
import type {
	ITelemetryLoggerExt,
	TelemetryEventPropertyTypeExt,
} from "@fluidframework/telemetry-utils/internal";

import type { IPerfSignalReport } from "./connectionTelemetry.js";

/**
 * Processes incoming signals for telemetry tracking.
 * @remarks
 * Instead of modifying the input signalTracking object, it returns an object with updates to be applied,
 * or undefined if no changes are needed.
 */
export function processSignalForTelemetry(
	envelope: ISignalEnvelope,
	signalTracking: IPerfSignalReport,
	logger: ITelemetryLoggerExt,
	consecutiveReconnects: number,
): IPerfSignalReport | undefined {
	const {
		clientBroadcastSignalSequenceNumber,
		contents: envelopeContents,
		address: envelopeAddress,
	} = envelope;

	if (clientBroadcastSignalSequenceNumber === undefined) {
		return undefined;
	}

	if (
		signalTracking.trackingSignalSequenceNumber === undefined ||
		signalTracking.minimumTrackingSignalSequenceNumber === undefined
	) {
		return undefined;
	}

	// Initialize the result with the received values
	const result: IPerfSignalReport = {
		...signalTracking,
	};

	if (clientBroadcastSignalSequenceNumber >= signalTracking.trackingSignalSequenceNumber) {
		// Calculate the number of signals lost and log the event.
		const signalsLost =
			clientBroadcastSignalSequenceNumber - signalTracking.trackingSignalSequenceNumber;
		if (signalsLost > 0) {
			result.signalsLost = signalTracking.signalsLost + signalsLost;
			logger.sendErrorEvent({
				eventName: "SignalLost",
				details: {
					signalsLost, // Number of lost signals detected.
					expectedSequenceNumber: signalTracking.trackingSignalSequenceNumber, // The next expected signal sequence number.
					clientBroadcastSignalSequenceNumber, // Actual signal sequence number received.
				},
			});
		}
		// Update the tracking signal sequence number to the next expected signal in the sequence.
		result.trackingSignalSequenceNumber = clientBroadcastSignalSequenceNumber + 1;
	} else if (
		// Check if this is a signal in range of interest.
		clientBroadcastSignalSequenceNumber >= signalTracking.minimumTrackingSignalSequenceNumber
	) {
		result.signalsOutOfOrder = signalTracking.signalsOutOfOrder + 1;
		const details: TelemetryEventPropertyTypeExt = {
			expectedSequenceNumber: signalTracking.trackingSignalSequenceNumber, // The next expected signal sequence number.
			clientBroadcastSignalSequenceNumber, // Sequence number of the out of order signal.
		};
		// Only log `contents.type` when address is for container to avoid chance that contents type is customer data.
		if (envelopeAddress === undefined) {
			details.contentsType = envelopeContents.type; // Type of signal that was received out of order.
		}
		logger.sendTelemetryEvent({
			eventName: "SignalOutOfOrder",
			details,
		});
	}

	if (
		signalTracking.roundTripSignalSequenceNumber !== undefined &&
		clientBroadcastSignalSequenceNumber >= signalTracking.roundTripSignalSequenceNumber
	) {
		if (clientBroadcastSignalSequenceNumber === signalTracking.roundTripSignalSequenceNumber) {
			// Latency tracked signal has been received.
			// We now emit telemetry with the roundtrip duration of the tracked signal.
			// The telemetry event also includes metrics for broadcast signals (sent, lost, and out of order),
			// and these metrics are reset after emitting the event.
			const duration = Date.now() - signalTracking.signalTimestamp;
			logger.sendPerformanceEvent({
				eventName: "SignalLatency",
				details: {
					duration, // Roundtrip duration of the tracked signal in milliseconds.
					sent: result.totalSignalsSentInLatencyWindow, // Signals sent since the last logged SignalLatency event.
					lost: result.signalsLost, // Signals lost since the last logged SignalLatency event.
					outOfOrder: result.signalsOutOfOrder, // Out of order signals since the last logged SignalLatency event.
					reconnectCount: consecutiveReconnects, // Container reconnect count.
				},
			});
			result.signalsLost = 0;
			result.signalsOutOfOrder = 0;
			result.signalTimestamp = 0;
			result.totalSignalsSentInLatencyWindow = 0;
		}
		result.roundTripSignalSequenceNumber = undefined;
	}
	return result;
}

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

const defaultTelemetrySignalSampleCount = 100;

export class SignalTelemetryManager {
	private readonly signalTracking: IPerfSignalReport = {
		totalSignalsSentInLatencyWindow: 0,
		signalsLost: 0,
		signalsOutOfOrder: 0,
		signalsSentSinceLastLatencyMeasurement: 0,
		broadcastSignalSequenceNumber: 0,
		signalTimestamp: 0,
		roundTripSignalSequenceNumber: undefined,
		trackingSignalSequenceNumber: undefined,
		minimumTrackingSignalSequenceNumber: undefined,
	};

	/**
	 * Resets the signal tracking state in the {@link SignalTelemetryManager}.
	 * @param signalTracking - ONLY FOR TESTING. Allows setting the signal tracking state in the {@link SignalTelemetryManager} to specific values.
	 */
	public resetTracking(
		signalTracking?: Omit<IPerfSignalReport, "broadcastSignalSequenceNumber">,
	): void {
		if (signalTracking === undefined) {
			this.signalTracking.signalsLost = 0;
			this.signalTracking.signalsOutOfOrder = 0;
			this.signalTracking.signalTimestamp = 0;
			this.signalTracking.signalsSentSinceLastLatencyMeasurement = 0;
			this.signalTracking.totalSignalsSentInLatencyWindow = 0;
			this.signalTracking.roundTripSignalSequenceNumber = undefined;
			this.signalTracking.trackingSignalSequenceNumber = undefined;
			this.signalTracking.minimumTrackingSignalSequenceNumber = undefined;
		} else {
			for (const [key, value] of Object.entries(signalTracking)) {
				this.signalTracking[key] = value;
			}
		}
	}

	/**
	 * Returns the signal tracking state in the {@link SignalTelemetryManager}.
	 * @remarks Only for testing purposes.
	 */
	public readonly signalTrackingState: IPerfSignalReport = this.signalTracking;

	/**
	 * Processes incoming signals for telemetry tracking.
	 */
	public processSignalForTelemetry(
		envelope: ISignalEnvelope,
		logger: ITelemetryLoggerExt,
		consecutiveReconnects: number,
	): void {
		const {
			clientBroadcastSignalSequenceNumber,
			contents: envelopeContents,
			address: envelopeAddress,
		} = envelope;

		if (clientBroadcastSignalSequenceNumber === undefined) {
			return undefined;
		}

		if (
			this.signalTracking.trackingSignalSequenceNumber === undefined ||
			this.signalTracking.minimumTrackingSignalSequenceNumber === undefined
		) {
			return undefined;
		}

		if (
			clientBroadcastSignalSequenceNumber >= this.signalTracking.trackingSignalSequenceNumber
		) {
			// Calculate the number of signals lost and log the event.
			const signalsLost =
				clientBroadcastSignalSequenceNumber - this.signalTracking.trackingSignalSequenceNumber;
			if (signalsLost > 0) {
				this.signalTracking.signalsLost += signalsLost;
				logger.sendErrorEvent({
					eventName: "SignalLost",
					details: {
						signalsLost, // Number of lost signals detected.
						expectedSequenceNumber: this.signalTracking.trackingSignalSequenceNumber, // The next expected signal sequence number.
						clientBroadcastSignalSequenceNumber, // Actual signal sequence number received.
					},
				});
			}
			// Update the tracking signal sequence number to the next expected signal in the sequence.
			this.signalTracking.trackingSignalSequenceNumber =
				clientBroadcastSignalSequenceNumber + 1;
		} else if (
			// Check if this is a signal in range of interest.
			clientBroadcastSignalSequenceNumber >=
			this.signalTracking.minimumTrackingSignalSequenceNumber
		) {
			this.signalTracking.signalsOutOfOrder++;
			const details: TelemetryEventPropertyTypeExt = {
				expectedSequenceNumber: this.signalTracking.trackingSignalSequenceNumber, // The next expected signal sequence number.
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
			this.signalTracking.roundTripSignalSequenceNumber !== undefined &&
			clientBroadcastSignalSequenceNumber >= this.signalTracking.roundTripSignalSequenceNumber
		) {
			if (
				clientBroadcastSignalSequenceNumber ===
				this.signalTracking.roundTripSignalSequenceNumber
			) {
				// Latency tracked signal has been received.
				// We now emit telemetry with the roundtrip duration of the tracked signal.
				// The telemetry event also includes metrics for broadcast signals (sent, lost, and out of order),
				// and these metrics are reset after emitting the event.
				const duration = Date.now() - this.signalTracking.signalTimestamp;
				logger.sendPerformanceEvent({
					eventName: "SignalLatency",
					details: {
						duration, // Roundtrip duration of the tracked signal in milliseconds.
						sent: this.signalTracking.totalSignalsSentInLatencyWindow, // Signals sent since the last logged SignalLatency event.
						lost: this.signalTracking.signalsLost, // Signals lost since the last logged SignalLatency event.
						outOfOrder: this.signalTracking.signalsOutOfOrder, // Out of order signals since the last logged SignalLatency event.
						reconnectCount: consecutiveReconnects, // Container reconnect count.
					},
				});
				this.signalTracking.signalsLost = 0;
				this.signalTracking.signalsOutOfOrder = 0;
				this.signalTracking.signalTimestamp = 0;
				this.signalTracking.totalSignalsSentInLatencyWindow = 0;
			}
			this.signalTracking.roundTripSignalSequenceNumber = undefined;
		}
	}

	public submitEnvelopedSignal(
		submitFn: (envelope: ISignalEnvelope, targetClientId?: string) => void,
		envelope: ISignalEnvelope,
		targetClientId?: string,
	): void {
		const isBroadcastSignal = targetClientId === undefined;

		if (isBroadcastSignal) {
			const clientBroadcastSignalSequenceNumber = ++this.signalTracking
				.broadcastSignalSequenceNumber;
			// Stamp with the broadcast signal sequence number.
			envelope.clientBroadcastSignalSequenceNumber = clientBroadcastSignalSequenceNumber;

			this.signalTracking.signalsSentSinceLastLatencyMeasurement++;

			if (
				this.signalTracking.minimumTrackingSignalSequenceNumber === undefined ||
				this.signalTracking.trackingSignalSequenceNumber === undefined
			) {
				// Signal monitoring window is undefined
				// Initialize tracking to expect the next signal sent by the connected client.
				this.signalTracking.minimumTrackingSignalSequenceNumber =
					clientBroadcastSignalSequenceNumber;
				this.signalTracking.trackingSignalSequenceNumber = clientBroadcastSignalSequenceNumber;
			}

			// We should not track the round trip of a new signal in the case we are already tracking one.
			if (
				clientBroadcastSignalSequenceNumber % defaultTelemetrySignalSampleCount === 1 &&
				this.signalTracking.roundTripSignalSequenceNumber === undefined
			) {
				this.signalTracking.signalTimestamp = Date.now();
				this.signalTracking.roundTripSignalSequenceNumber =
					clientBroadcastSignalSequenceNumber;
				this.signalTracking.totalSignalsSentInLatencyWindow +=
					this.signalTracking.signalsSentSinceLastLatencyMeasurement;
				this.signalTracking.signalsSentSinceLastLatencyMeasurement = 0;
			}
		}

		submitFn(envelope, targetClientId);
	}
}

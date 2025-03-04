/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISignalEnvelope } from "@fluidframework/core-interfaces/internal";
import type {
	ITelemetryLoggerExt,
	TelemetryEventPropertyTypeExt,
} from "@fluidframework/telemetry-utils/internal";

const defaultTelemetrySignalSampleCount = 100;

export interface IPerfSignalReport {
	/**
	 * Accumulates the total number of broadcast signals sent during the current signal latency measurement window.
	 * This value represents the total number of signals sent since the latency measurement began and is used
	 * logged in telemetry when the latency measurement completes.
	 */
	totalSignalsSentInLatencyWindow: number;

	/**
	 * Counts the number of broadcast signals sent since the last latency measurement was initiated.
	 * This counter increments with each broadcast signal sent. When a new latency measurement starts,
	 * this counter is added to `totalSignalsSentInLatencyWindow` and then reset to zero.
	 */
	signalsSentSinceLastLatencyMeasurement: number;

	/**
	 * Number of signals that were expected but not received.
	 */
	signalsLost: number;

	/**
	 * Number of signals received out of order/non-sequentially.
	 */
	signalsOutOfOrder: number;

	/**
	 * Timestamp before submitting the signal we will trace.
	 */
	signalTimestamp: number;

	/**
	 * Signal we will trace for roundtrip latency.
	 */
	roundTripSignalSequenceNumber: number | undefined;

	/**
	 * Next expected signal sequence number to be received.
	 */
	trackingSignalSequenceNumber: number | undefined;

	/**
	 * Inclusive lower bound of signal monitoring window.
	 * Used by the logic that checks if signals are received out of order.
	 */
	minimumTrackingSignalSequenceNumber: number | undefined;
}

export class SignalTelemetryManager {
	private readonly signalTracking: IPerfSignalReport = {
		totalSignalsSentInLatencyWindow: 0,
		signalsLost: 0,
		signalsOutOfOrder: 0,
		signalsSentSinceLastLatencyMeasurement: 0,
		signalTimestamp: 0,
		roundTripSignalSequenceNumber: undefined,
		trackingSignalSequenceNumber: undefined,
		minimumTrackingSignalSequenceNumber: undefined,
	};

	/**
	 * Identifier to track broadcast signals being submitted in order to
	 * allow collection of data around the roundtrip of signal messages.
	 */
	private broadcastSignalSequenceNumber: number = 0;

	/**
	 * Resets the signal tracking state in the {@link SignalTelemetryManager}.
	 */
	public resetTracking(): void {
		this.signalTracking.signalsLost = 0;
		this.signalTracking.signalsOutOfOrder = 0;
		this.signalTracking.signalTimestamp = 0;
		this.signalTracking.signalsSentSinceLastLatencyMeasurement = 0;
		this.signalTracking.totalSignalsSentInLatencyWindow = 0;
		this.signalTracking.roundTripSignalSequenceNumber = undefined;
		this.signalTracking.trackingSignalSequenceNumber = undefined;
		this.signalTracking.minimumTrackingSignalSequenceNumber = undefined;
	}

	/**
	 * Perform telemetry-related processing of incoming signals.
	 * @param envelope - The signal envelope to process.
	 * @param logger - The telemetry logger to use for emitting telemetry events.
	 * @param consecutiveReconnects - The number of consecutive reconnects that have occurred. Only used for logging.
	 */
	public processSignalForTelemetry(
		envelope: ISignalEnvelope,
		logger: ITelemetryLoggerExt,
		consecutiveReconnects: number,
	): void {
		const {
			clientBroadcastSignalSequenceNumber: signalSequenceNumber,
			contents: envelopeContents,
			address: envelopeAddress,
		} = envelope;

		if (signalSequenceNumber === undefined) {
			return undefined;
		}

		// If no tracking window has been set, nothing to do
		if (
			this.signalTracking.trackingSignalSequenceNumber === undefined ||
			this.signalTracking.minimumTrackingSignalSequenceNumber === undefined
		) {
			return undefined;
		}

		if (signalSequenceNumber >= this.signalTracking.trackingSignalSequenceNumber) {
			// Calculate the number of signals lost and log the event.
			const signalsLost =
				signalSequenceNumber - this.signalTracking.trackingSignalSequenceNumber;
			if (signalsLost > 0) {
				this.signalTracking.signalsLost += signalsLost;
				logger.sendErrorEvent({
					eventName: "SignalLost",
					details: {
						signalsLost, // Number of lost signals detected.
						expectedSequenceNumber: this.signalTracking.trackingSignalSequenceNumber, // The next expected signal sequence number.
						clientBroadcastSignalSequenceNumber: signalSequenceNumber, // Actual signal sequence number received.
					},
				});
			}
			// Update the tracking signal sequence number to the next expected signal in the sequence.
			this.signalTracking.trackingSignalSequenceNumber = signalSequenceNumber + 1;
		} else if (
			// Check if this is a signal in range of interest.
			signalSequenceNumber >= this.signalTracking.minimumTrackingSignalSequenceNumber
		) {
			this.signalTracking.signalsOutOfOrder++;
			const details: TelemetryEventPropertyTypeExt = {
				expectedSequenceNumber: this.signalTracking.trackingSignalSequenceNumber, // The next expected signal sequence number.
				clientBroadcastSignalSequenceNumber: signalSequenceNumber, // Sequence number of the out of order signal.
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
			signalSequenceNumber >= this.signalTracking.roundTripSignalSequenceNumber
		) {
			if (signalSequenceNumber === this.signalTracking.roundTripSignalSequenceNumber) {
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

	public applyTrackingToSignalEnvelope(
		envelope: ISignalEnvelope,
		targetClientId?: string,
	): void {
		const isBroadcastSignal = targetClientId === undefined;

		if (isBroadcastSignal) {
			const clientBroadcastSignalSeqNo = ++this.broadcastSignalSequenceNumber;

			// Stamp with the broadcast signal sequence number.
			envelope.clientBroadcastSignalSequenceNumber = clientBroadcastSignalSeqNo;

			this.signalTracking.signalsSentSinceLastLatencyMeasurement++;

			// If we don't have a signal monitoring window yet,
			// initialize tracking to expect the next signal sent by the connected client.
			if (
				this.signalTracking.minimumTrackingSignalSequenceNumber === undefined ||
				this.signalTracking.trackingSignalSequenceNumber === undefined
			) {
				this.signalTracking.minimumTrackingSignalSequenceNumber = clientBroadcastSignalSeqNo;
				this.signalTracking.trackingSignalSequenceNumber = clientBroadcastSignalSeqNo;
			}

			// Start tracking roundtrip for a new signal only if we are not tracking one already (and sampling logic is met)
			if (
				this.signalTracking.roundTripSignalSequenceNumber === undefined &&
				clientBroadcastSignalSeqNo % defaultTelemetrySignalSampleCount === 1
			) {
				this.signalTracking.signalTimestamp = Date.now();
				this.signalTracking.roundTripSignalSequenceNumber = clientBroadcastSignalSeqNo;
				this.signalTracking.totalSignalsSentInLatencyWindow +=
					this.signalTracking.signalsSentSinceLastLatencyMeasurement;
				this.signalTracking.signalsSentSinceLastLatencyMeasurement = 0;
			}
		}
	}
}

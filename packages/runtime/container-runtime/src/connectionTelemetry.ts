/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryLoggerExt,
	createChildLogger,
	formatTick,
	loggerToMonitoringContext,
} from "@fluidframework/telemetry-utils";
import { IDeltaManager } from "@fluidframework/container-definitions";
import {
	IDocumentMessage,
	ISequencedDocumentMessage,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { TypedEventEmitter, assert, performance } from "@fluidframework/common-utils";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

/**
 * We report various latency-related errors when waiting for op roundtrip takes longer than that amout of time.
 */
export const latencyThreshold = 5000;

// Phases in OpPerfTelemetry:
// 1.	Op is added to DeltaManager (DM) buffer.
// 2.	Op is sent to service (op leaves outbound queue).
// 	 - Note: We do not know for sure when op is sent, we only track when it is added to outbound queue.
//     If outbound queue is paused, time queue is paused is counted as network time.
// 3.	Op received from service back (pushed to inbound queue).
// 4.	Op is processed.
interface IOpPerfTelemetryProperties {
	/** Measure time between (1) and (2) - Measure time outbound op is sitting in queue due to active batch */
	durationOutboundBatching: number; // was durationOutboundQueue in previous versions
	/** Measure time between (2) and (3) - Track how long it took for op to be acked by service */
	durationNetwork: number; // was durationInboundQueue
	/** Measure time between (3) and (4) - Time between DM's inbound "push" event until DM's "op" event */
	durationInboundToProcessing: number;
	/** Length of the DeltaManager's inbound queue at the time of the DM's inbound "push" event (3) */
	lengthInboundQueue: number;
}

/**
 * Timings collected at various moments during the op processing.
 */
interface IOpPerfTimings {
	/** Starting time for (1) */
	submitOpEventTime: number;
	/** Starting time for (2) */
	outboundPushEventTime: number;
	/** Starting time for (3) */
	inboundPushEventTime: number;
}

/**
 * Wraps around an existing logger and applies a provided callback to determine if an event should be sampled.
 */
function createSampledLogger(
	logger: ITelemetryBaseLogger,
	shouldSampleEventCallback: () => boolean,
) {
	const monitoringContext = loggerToMonitoringContext(logger);
	const isSamplingDisabled = monitoringContext.config.getBoolean(
		"Fluid.Telemetry.DisableSampling",
	);

	const sampledLogger: ITelemetryBaseLogger = {
		send: (event: ITelemetryBaseEvent) => {
			if (isSamplingDisabled || shouldSampleEventCallback() === true) {
				logger.send(event);
			}
		},
	};

	return sampledLogger;
}

/**
 * sampletext
 */
const createSystematicSamplingCallback = (samplingRate: number) => {
	const state = {
		eventsSinceLastSample: 0,
		isFirstEvent: true,
	};
	return () => {
		state.eventsSinceLastSample++;
		if (state.isFirstEvent) {
			state.isFirstEvent = false;
			return true;
		}
		const shouldSample = state.eventsSinceLastSample % samplingRate === 0;
		if (shouldSample) {
			state.eventsSinceLastSample = 0;
		}
		return shouldSample;
	};
};

export class OpPerfTelemetry extends TypedEventEmitter<IOpPerfTelemetryProperties> {
	private pongCount: number = 0;
	private pingLatency: number | undefined;

	// Collab window tracking. This is timestamp of %1000 message.
	private sequenceNumberForMsnTracking: number | undefined;
	private msnTrackingTimestamp: number = 0;
	private readonly latencyStatistics = new Map<
		number,
		{
			opProcessingTimes: Partial<IOpPerfTimings>;
			opPerfData: Partial<IOpPerfTelemetryProperties>;
		}
	>();

	private firstConnection = true;
	private connectionOpSeqNumber: number | undefined;
	private readonly bootTime = performance.now();
	private connectionStartTime = 0;
	private gap = 0;

	private readonly logger: ITelemetryLoggerExt;
	private readonly sampledLogger: ITelemetryLoggerExt;

	public constructor(
		private clientId: string | undefined,
		private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		logger: ITelemetryLoggerExt,
	) {
		super();
		this.logger = createChildLogger({ logger, namespace: "OpPerf" });
		this.sampledLogger = createChildLogger({
			logger: createSampledLogger(this.logger, createSystematicSamplingCallback(500)),
		});

		this.deltaManager.on("pong", (latency) => this.recordPingTime(latency));
		this.deltaManager.on("submitOp", (message) => this.beforeOpSubmit(message));

		this.deltaManager.on("op", (message) => this.afterProcessingOp(message));

		this.deltaManager.on("connect", (details, opsBehind) => {
			this.clientId = details.clientId;
			if (opsBehind !== undefined) {
				this.connectionOpSeqNumber = this.deltaManager.lastKnownSeqNumber;
				this.gap = opsBehind;
				this.connectionStartTime = performance.now();

				// We might be already up-today. If so, report it right away.
				if (this.gap <= 0) {
					this.reportGettingUpToDate();
				}
			}
		});
		this.deltaManager.on("disconnect", () => {
			this.sequenceNumberForMsnTracking = undefined;
			this.latencyStatistics.clear();
			this.connectionOpSeqNumber = undefined;
			this.firstConnection = false;
			this.pongCount = 0;
		});

		this.deltaManager.outbound.on("push", (messages) => {
			for (const msg of messages) {
				if (msg.type === MessageType.Operation) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const latencyStats = this.latencyStatistics.get(msg.clientSequenceNumber)!;

					assert(
						latencyStats.opProcessingTimes.outboundPushEventTime === undefined,
						0x2c8 /* "outboundPushEventTime should be undefined" */,
					);
					assert(
						latencyStats.opPerfData.durationNetwork === undefined,
						0x2c9 /* "durationNetwork should be undefined" */,
					);
					latencyStats.opProcessingTimes.outboundPushEventTime = Date.now();

					assert(
						latencyStats.opPerfData.durationOutboundBatching === undefined,
						0x2ca /* "durationOutboundBatching should be undefined" */,
					);

					assert(
						latencyStats.opProcessingTimes.submitOpEventTime !== undefined,
						0x2cb /* "submitOpEventTime should be undefined" */,
					);

					latencyStats.opPerfData.durationOutboundBatching =
						latencyStats.opProcessingTimes.outboundPushEventTime -
						latencyStats.opProcessingTimes.submitOpEventTime;
				}
			}
		});

		this.deltaManager.inbound.on("push", (message: ISequencedDocumentMessage) => {
			if (this.clientId === message.clientId && message.type === MessageType.Operation) {
				const latencyStats = this.latencyStatistics.get(message.clientSequenceNumber);
				assert(latencyStats !== undefined, "Latency stats for op should exist");

				if (latencyStats.opProcessingTimes.outboundPushEventTime !== undefined) {
					latencyStats.opProcessingTimes.inboundPushEventTime = Date.now();
					latencyStats.opPerfData.durationNetwork =
						latencyStats.opProcessingTimes.inboundPushEventTime -
						latencyStats.opProcessingTimes.outboundPushEventTime;
					latencyStats.opPerfData.lengthInboundQueue = this.deltaManager.inbound.length;
				}
			}
		});

		this.deltaManager.inbound.on("idle", (count: number, duration: number) => {
			// Do not want to log zero for sure.
			// We are more interested in aggregates, so logging only if we are processing some number of ops
			// Cut-off is arbitrary - can be increased or decreased based on amount of data collected and questions we
			// want to get answered
			// back-compat: Once 0.36 loader version saturates (count & duration args were added there),
			// we can remove typeof check.
			if (typeof count === "number" && count >= 100) {
				this.logger.sendPerformanceEvent({
					eventName: "GetDeltas_OpProcessing",
					count,
					duration,
				});
			}
		});
	}

	private reportGettingUpToDate() {
		this.connectionOpSeqNumber = undefined;
		this.logger.sendPerformanceEvent({
			eventName: "ConnectionSpeed",
			duration: performance.now() - this.connectionStartTime,
			ops: this.gap,
			// track time to connect only for first connection.
			timeToConnect: this.firstConnection
				? formatTick(this.connectionStartTime - this.bootTime)
				: undefined,
			firstConnection: this.firstConnection,
		});
	}

	private recordPingTime(latency: number) {
		this.pingLatency = latency;

		// Log if latency is longer than 1 min
		if (latency > 1000 * 60) {
			this.logger.sendErrorEvent({
				eventName: "LatencyTooLong",
				duration: latency,
			});
		}

		// logging one in every 100 pongs, including the first time, if it is a "write" client.
		if (this.pongCount % 100 === 0 && this.deltaManager.active) {
			this.logger.sendPerformanceEvent({
				eventName: "DeltaLatency",
				duration: latency,
			});
		}
		this.pongCount++;
	}

	private beforeOpSubmit(message: IDocumentMessage) {
		assert(
			this.latencyStatistics.get(message.clientSequenceNumber) === undefined,
			"Existing op perf data for client sequence number",
		);
		this.latencyStatistics.set(message.clientSequenceNumber, {
			opProcessingTimes: {
				submitOpEventTime: Date.now(),
			},
			opPerfData: {},
		});
	}

	private afterProcessingOp(message: ISequencedDocumentMessage) {
		const sequenceNumber = message.sequenceNumber;

		if (sequenceNumber === this.connectionOpSeqNumber) {
			this.reportGettingUpToDate();
		}

		// Record collab window max size after every 1000th op.
		if (this.sequenceNumberForMsnTracking === undefined && sequenceNumber % 1000 === 0) {
			this.sequenceNumberForMsnTracking = sequenceNumber;
			this.msnTrackingTimestamp = message.timestamp;
		}
		if (
			this.sequenceNumberForMsnTracking !== undefined &&
			message.minimumSequenceNumber >= this.sequenceNumberForMsnTracking
		) {
			assert(
				this.msnTrackingTimestamp !== undefined,
				0x2ce /* "msnTrackingTimestamp should not be undefined" */,
			);
			this.logger.sendPerformanceEvent({
				eventName: "MsnStatistics",
				sequenceNumber,
				msnDistance: sequenceNumber - this.sequenceNumberForMsnTracking,
				duration: message.timestamp - this.msnTrackingTimestamp,
			});
			this.sequenceNumberForMsnTracking = undefined;
		}

		if (this.clientId === message.clientId) {
			const latencyData = this.latencyStatistics.get(message.clientSequenceNumber);
			assert(latencyData !== undefined, "Undefined latency statistics for op");
			assert(
				latencyData.opProcessingTimes.submitOpEventTime !== undefined,
				0x120 /* "Undefined latency statistics for op (op send time)" */,
			);
			const currentTime = Date.now();

			if (latencyData.opProcessingTimes.inboundPushEventTime !== undefined) {
				latencyData.opPerfData.durationInboundToProcessing =
					currentTime - latencyData.opProcessingTimes.inboundPushEventTime;
			}

			const duration = currentTime - latencyData.opProcessingTimes.submitOpEventTime;

			// One of the core expectations for Fluid service is to be fast.
			// When it's not the case, we want to learn about it and be able to investigate, so
			// raise awareness.
			// This also helps identify cases where it's due to client behavior (sending too many ops)
			// that results in overwhelming ordering service and thus starting to see long latencies.
			// The threshold could be adjusted, but ideally it stays  workload-agnostic, as service
			// performance impacts all workloads relying on service.
			const category = duration > latencyThreshold ? "error" : "performance";

			this.sampledLogger.sendPerformanceEvent({
				eventName: "OpRoundtripTime",
				sequenceNumber,
				referenceSequenceNumber: message.referenceSequenceNumber,
				duration,
				category,
				pingLatency: this.pingLatency,
				msnDistance:
					this.deltaManager.lastSequenceNumber - this.deltaManager.minimumSequenceNumber,
				...latencyData.opPerfData,
			});
			this.latencyStatistics.delete(message.clientSequenceNumber);
		}
	}
}
export interface IPerfSignalReport {
	/**
	 * Identifier for the signal being submitted in order to
	 * allow collection of data around the roundtrip of signal messages.
	 */
	signalSequenceNumber: number;
	/**
	 * Number of signals that were expected but not received.
	 */
	signalsLost: number;

	/**
	 * Timestamp before submitting the signal we will trace.
	 */
	signalTimestamp: number;

	/**
	 * Expected Signal Sequence to be received.
	 */
	trackingSignalSequenceNumber: number | undefined;
}

export function ReportOpPerfTelemetry(
	clientId: string | undefined,
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
	logger: ITelemetryLoggerExt,
) {
	new OpPerfTelemetry(clientId, deltaManager, logger);
}

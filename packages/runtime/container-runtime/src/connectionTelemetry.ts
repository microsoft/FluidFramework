/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluid-internal/client-utils";
import { IDeltaManagerFull } from "@fluidframework/container-definitions/internal";
import { IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { IEventProvider } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IDocumentMessage,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { isRuntimeMessage } from "@fluidframework/driver-utils/internal";
import {
	IEventSampler,
	ITelemetryLoggerExt,
	ISampledTelemetryLogger,
	createChildLogger,
	createSampledLogger,
	formatTick,
} from "@fluidframework/telemetry-utils/internal";

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
	/**
	 * Measure time between (1) and (2) - Measure time outbound op is sitting in queue due to active batch
	 */
	durationOutboundBatching: number; // was durationOutboundQueue in previous versions
	/**
	 * Measure time between (2) and (3) - Track how long it took for op to be acked by service
	 */
	durationNetwork: number; // was durationInboundQueue
	/**
	 * Measure time between (3) and (4) - Time between DM's inbound "push" event until DM's "op" event
	 */
	durationInboundToProcessing: number;
	/**
	 * Length of the DeltaManager's inbound queue at the time of the DM's inbound "push" event (3)
	 */
	lengthInboundQueue: number;
}

/**
 * Timings collected at various moments during the op processing.
 */
interface IOpPerfTimings {
	/**
	 * Starting time for (1)
	 */
	submitOpEventTime: number;
	/**
	 * Starting time for (2)
	 */
	outboundPushEventTime: number;
	/**
	 * Starting time for (3)
	 */
	inboundPushEventTime: number;
}

class OpPerfTelemetry {
	private pingLatency: number | undefined;

	// Collab window tracking. This is timestamp of %1000 message.
	private sequenceNumberForMsnTracking: number | undefined;
	private msnTrackingTimestamp: number = 0;
	// To track round trip time for every %500 client message.
	private clientSequenceNumberForLatencyStatistics: number | undefined;
	// Performance Data to be reported for ops round trips and processing.
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

	/**
	 * Count of no-ops sent by this client. This variable is reset everytime the OpStats sampled event is logged
	 */
	private noOpCountForTelemetry = 0;
	/**
	 * Cumulative size of the ops processed by this client. This variable is reset everytime the OpStats sampled event is logged
	 */
	private processedOpSizeForTelemetry = 0;

	private readonly logger: ITelemetryLoggerExt;

	private static readonly OP_LATENCY_SAMPLE_RATE = 500;
	private readonly opLatencyLogger: ISampledTelemetryLogger;

	private static readonly DELTA_LATENCY_SAMPLE_RATE = 100;
	private readonly deltaLatencyLogger: ISampledTelemetryLogger;

	private static readonly PROCESSED_OPS_SAMPLE_RATE = 500;

	/**
	 * A sampled logger to log Ops that have been processed by the current client, the NoOp sent and the
	 * size of the ops processed within one sampling window of this log event.
	 * The data from this logger will be used to monitor the efficiency of NoOp-heuristics or to get approximate collab window size.
	 * Note: no log events are sent when sampling is disabled, because logging at every op will be too noisy.
	 */
	private readonly opsLogger: ISampledTelemetryLogger;

	/**
	 * Create an instance of OpPerfTelemetry which starts monitoring and generating telemetry related to op performance.
	 *
	 * @param clientId - The clientId of the current container.
	 * @param deltaManager - DeltaManager instance to monitor.
	 * @param containerRuntimeEvents - Emitter of events for the container runtime.
	 * @param logger - Telemetry logger to write events to.
	 */
	public constructor(
		/**
		 * The clientId of the current container.
		 *
		 * @remarks Until the container connects to the server and receives an ack for its own join op, this can be undefined.
		 * It gets updated in response to event changes once the value provided by the server is available.
		 * If the container loses its connection, this could be the last known clientId.
		 */
		private clientId: string | undefined,
		/**
		 * DeltaManager instance to monitor.
		 */
		private readonly deltaManager: IDeltaManagerFull,
		/**
		 * Emitter of events for the container runtime.
		 */
		containerRuntimeEvents: IEventProvider<IContainerRuntimeEvents>,
		/**
		 * Telemetry logger to write events to.
		 */
		logger: ITelemetryLoggerExt,
	) {
		this.logger = createChildLogger({ logger, namespace: "OpPerf" });

		const deltaLatencyEventSampler: IEventSampler = (() => {
			let eventCount = -1;
			return {
				sample: () => {
					eventCount++;
					const shouldSample = eventCount % OpPerfTelemetry.DELTA_LATENCY_SAMPLE_RATE === 0;
					if (shouldSample) {
						eventCount = 0;
					}
					return shouldSample;
				},
			};
		})();

		this.deltaLatencyLogger = createSampledLogger(logger, deltaLatencyEventSampler);

		// The SampledLogger here is used get access to the isSamplingDisabled property derived from
		// telemetry config properties. The actual sampling logic for op messages happens outside this SampledLogger
		// due to complexity of the different asynchronus scenarios of the op message lifecycle.
		this.opLatencyLogger = createSampledLogger(logger);

		const opsEventSampler: IEventSampler = (() => {
			let eventCount = 0;
			return {
				sample: () => {
					eventCount++;
					const shouldSample = eventCount % OpPerfTelemetry.PROCESSED_OPS_SAMPLE_RATE === 0;
					if (shouldSample) {
						eventCount = 0;
						this.noOpCountForTelemetry = 0;
						this.processedOpSizeForTelemetry = 0;
					}
					return shouldSample;
				},
			};
		})();
		this.opsLogger = createSampledLogger(
			logger,
			opsEventSampler,
			true /* skipLoggingWhenSamplingIsDisabled */,
		);

		this.deltaManager.on("pong", (latency) => this.recordPingTime(latency));
		this.deltaManager.on("submitOp", (message) => this.beforeOpSubmit(message));
		this.deltaManager.on("op", (message) => this.afterProcessingOp(message));
		this.deltaManager.on("connect", (details, opsBehind) => {
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
			this.clientSequenceNumberForLatencyStatistics = undefined;
			this.connectionOpSeqNumber = undefined;
			this.firstConnection = false;
			this.latencyStatistics.clear();
		});

		this.deltaManager.outbound.on("push", (messages) => {
			for (const msg of messages) {
				if (
					msg.type === MessageType.Operation &&
					(this.opLatencyLogger.isSamplingDisabled ||
						this.clientSequenceNumberForLatencyStatistics === msg.clientSequenceNumber)
				) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const latencyStats = this.latencyStatistics.get(msg.clientSequenceNumber)!;
					assert(latencyStats !== undefined, 0x7c2 /* Latency stats for op should exist */);
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
			if (
				this.clientId === message.clientId &&
				message.type === MessageType.Operation &&
				(this.opLatencyLogger.isSamplingDisabled ||
					this.clientSequenceNumberForLatencyStatistics === message.clientSequenceNumber)
			) {
				// We do an explicit check for undefined right after this
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const latencyStats = this.latencyStatistics.get(message.clientSequenceNumber)!;
				assert(latencyStats !== undefined, 0x7c3 /* Latency stats for op should exist */);
				if (latencyStats.opProcessingTimes.outboundPushEventTime !== undefined) {
					latencyStats.opProcessingTimes.inboundPushEventTime = Date.now();
					latencyStats.opPerfData.durationNetwork =
						latencyStats.opProcessingTimes.inboundPushEventTime -
						latencyStats.opProcessingTimes.outboundPushEventTime;
					latencyStats.opPerfData.lengthInboundQueue = this.deltaManager.inbound.length;
				}
			}
			if (isRuntimeMessage(message) && typeof message.contents === "string") {
				this.processedOpSizeForTelemetry += message.contents.length;
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

		containerRuntimeEvents.on("connected", (newClientId) => {
			this.clientId = newClientId;
		});
	}

	private reportGettingUpToDate(): void {
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

	private recordPingTime(latency: number): void {
		this.pingLatency = latency;

		// Log if latency is longer than 1 min
		if (latency > 1000 * 60) {
			this.logger.sendErrorEvent({
				eventName: "LatencyTooLong",
				duration: latency,
			});
		}

		// logging one in every DELTA_LATENCY_SAMPLE_RATE pongs, including the first time, if it is a "write" client.
		if (this.deltaManager.active) {
			this.deltaLatencyLogger.sendPerformanceEvent({
				eventName: "DeltaLatency",
				duration: latency,
			});
		}
	}

	private beforeOpSubmit(message: IDocumentMessage): void {
		// start with first client op and measure latency every 500 client ops
		if (
			this.opLatencyLogger.isSamplingDisabled ||
			(this.clientSequenceNumberForLatencyStatistics === undefined &&
				message.clientSequenceNumber % OpPerfTelemetry.OP_LATENCY_SAMPLE_RATE === 1)
		) {
			assert(
				this.latencyStatistics.get(message.clientSequenceNumber) === undefined,
				0x7c4 /* Existing op perf data for client sequence number */,
			);
			this.clientSequenceNumberForLatencyStatistics = message.clientSequenceNumber;
			this.latencyStatistics.set(message.clientSequenceNumber, {
				opProcessingTimes: {
					submitOpEventTime: Date.now(),
				},
				opPerfData: {},
			});
		}

		if (message.type === MessageType.NoOp) {
			// Count the number of no-ops submitted by this client.
			// The value is reset when we log the OpStats sampled event.
			this.noOpCountForTelemetry++;
		}
	}

	private afterProcessingOp(message: ISequencedDocumentMessage): void {
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

		if (
			this.clientId === message.clientId &&
			message.type === MessageType.Operation &&
			(this.opLatencyLogger.isSamplingDisabled ||
				this.clientSequenceNumberForLatencyStatistics === message.clientSequenceNumber)
		) {
			// We do an explicit check for undefined right after this
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const latencyData = this.latencyStatistics.get(message.clientSequenceNumber)!;
			assert(latencyData !== undefined, 0x7c5 /* Undefined latency statistics for op */);
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
			this.opLatencyLogger.sendPerformanceEvent({
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

			this.clientSequenceNumberForLatencyStatistics = undefined;
			this.latencyStatistics.delete(message.clientSequenceNumber);
		}

		if (isRuntimeMessage(message)) {
			// Sampled logging of Ops that have been processed by the current client, the NoOp sent and the
			// size of the ops processed within one sampling window of this log event.
			// This data will be used to monitor the efficiency of NoOp-heuristics or to get approximate collab window size.
			this.opsLogger.sendPerformanceEvent({
				eventName: "OpStats",
				// Logging as 'details' property to avoid adding new column name to the log tables */
				details: {
					// Count of the ops processed by the current client. Note: these counts are after
					// compression/grouping/chunking (if enabled) of the ops.
					processedOpCount: OpPerfTelemetry.PROCESSED_OPS_SAMPLE_RATE,
					// Cumulative size of all the ops processed by the current client since the last OpStats event log
					processedOpSize: this.processedOpSizeForTelemetry,
					// Count of all the NoOp sent by the current client since the last OpStats event log
					submitedNoOpCount: this.noOpCountForTelemetry,
				},
			});
		}
	}
}
export interface IPerfSignalReport {
	/**
	 * Identifier to track broadcast signals being submitted in order to
	 * allow collection of data around the roundtrip of signal messages.
	 */
	broadcastSignalSequenceNumber: number;

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
	 */
	minimumTrackingSignalSequenceNumber: number | undefined;
}

/**
 * Starts monitoring and generation of telemetry related to op performance.
 *
 * @param clientId - The clientId of the current container.
 * @param deltaManager - DeltaManager instance to monitor.
 * @param containerRuntimeEvents - Emitter of events for the container runtime.
 * @param logger - Telemetry logger to write events to.
 */
export function ReportOpPerfTelemetry(
	clientId: string | undefined,
	deltaManager: IDeltaManagerFull,
	containerRuntimeEvents: IEventProvider<IContainerRuntimeEvents>,
	logger: ITelemetryBaseLogger,
): void {
	new OpPerfTelemetry(
		clientId,
		deltaManager,
		containerRuntimeEvents,
		createChildLogger({ logger }),
	);
}

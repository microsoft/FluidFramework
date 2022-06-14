/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { assert, performance } from "@fluidframework/common-utils";

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

class OpPerfTelemetry {
    private pongCount: number = 0;
    private pingLatency: number | undefined;

    // Collab window tracking. This is timestamp of %1000 message.
    private sequenceNumberForMsnTracking: number | undefined;
    private msnTrackingTimestamp: number = 0;
    // To track round trip time for every %500 client message.
    private clientSequenceNumberForLatencyStatistics: number | undefined;

    private opProcessingTimes: Partial<IOpPerfTimings> = {};

    // Performance Data to be reported for ops round trips and processing.
    private opPerfData: Partial<IOpPerfTelemetryProperties> = {};

    private firstConnection = true;
    private connectionOpSeqNumber: number | undefined;
    private readonly bootTime = performance.now();
    private connectionStartTime = 0;
    private gap = 0;

    private readonly logger: ITelemetryLogger;

    public constructor(
        private clientId: string | undefined,
        private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        logger: ITelemetryLogger) {
        this.logger = ChildLogger.create(logger, "OpPerf");

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
            this.clientSequenceNumberForLatencyStatistics = undefined;
            this.opProcessingTimes = {};
            this.opPerfData = {};
            this.connectionOpSeqNumber = undefined;
            this.firstConnection = false;
            this.pongCount = 0;
        });

        this.deltaManager.outbound.on("push", (messages) => {
            for (const msg of messages) {
                if (msg.type === MessageType.Operation &&
                    this.clientSequenceNumberForLatencyStatistics === msg.clientSequenceNumber) {
                    assert(this.opProcessingTimes.outboundPushEventTime === undefined,
                        0x2c8 /* "outboundPushEventTime should be undefined" */);
                    assert(this.opPerfData.durationNetwork === undefined,
                        0x2c9 /* "durationNetwork should be undefined" */);
                    this.opProcessingTimes.outboundPushEventTime = Date.now();

                    assert(this.opPerfData.durationOutboundBatching === undefined,
                        0x2ca /* "durationOutboundBatching should be undefined" */);

                    assert(this.opProcessingTimes.submitOpEventTime !== undefined,
                        0x2cb /* "submitOpEventTime should be undefined" */);

                    this.opPerfData.durationOutboundBatching = this.opProcessingTimes.outboundPushEventTime
                        - this.opProcessingTimes.submitOpEventTime;
                }
            }
        });

        this.deltaManager.inbound.on("push", (message: ISequencedDocumentMessage) => {
            if (this.clientId === message.clientId &&
                message.type === MessageType.Operation &&
                this.clientSequenceNumberForLatencyStatistics === message.clientSequenceNumber &&
                this.opProcessingTimes.outboundPushEventTime !== undefined) {
                this.opProcessingTimes.inboundPushEventTime = Date.now();
                this.opPerfData.durationNetwork = this.opProcessingTimes.inboundPushEventTime
                                     - this.opProcessingTimes.outboundPushEventTime;
                this.opProcessingTimes.outboundPushEventTime = undefined;
                this.opPerfData.lengthInboundQueue = this.deltaManager.inbound.length;
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
            timeToConnect: this.firstConnection ?
                TelemetryLogger.formatTick(this.connectionStartTime - this.bootTime) :
                undefined,
            firstConnection: this.firstConnection,
        });
    }

    private recordPingTime(latency: number) {
        this.pingLatency = latency;
        // logging one in every 1000 pongs, including the first time, if it is a "write" client.
        if (this.pongCount % 100 === 0 && this.deltaManager.active) {
            this.logger.sendPerformanceEvent({
                eventName: "DeltaLatency",
                duration: latency,
            });
        }
        this.pongCount++;
    }

    private beforeOpSubmit(message: IDocumentMessage) {
        // start with first client op and measure latency every 500 client ops
        if (this.clientSequenceNumberForLatencyStatistics === undefined &&
            message.clientSequenceNumber % 500 === 1) {
            assert(this.opProcessingTimes.outboundPushEventTime === undefined,
                0x2cc /* "OpTimeSittingInboundQueue should be undefined" */);
            assert(this.opPerfData.durationNetwork === undefined,
                0x2cd /* "durationNetwork should be undefined" */);
            this.opProcessingTimes.submitOpEventTime = Date.now();
            this.clientSequenceNumberForLatencyStatistics = message.clientSequenceNumber;
        }
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
        if (this.sequenceNumberForMsnTracking !== undefined &&
                message.minimumSequenceNumber >= this.sequenceNumberForMsnTracking) {
            assert(this.msnTrackingTimestamp !== undefined,
                0x2ce /* "msnTrackingTimestamp should not be undefined" */);
            this.logger.sendPerformanceEvent({
                eventName: "MsnStatistics",
                sequenceNumber,
                msnDistance: sequenceNumber - this.sequenceNumberForMsnTracking,
                duration: message.timestamp - this.msnTrackingTimestamp,
            });
            this.sequenceNumberForMsnTracking = undefined;
        }

        if (this.clientId === message.clientId &&
            this.clientSequenceNumberForLatencyStatistics === message.clientSequenceNumber) {
            assert(this.opProcessingTimes.submitOpEventTime !== undefined,
                0x120 /* "Undefined latency statistics (op send time)" */);
            const currentTime = Date.now();

            if (this.opProcessingTimes.inboundPushEventTime !== undefined) {
                this.opPerfData.durationInboundToProcessing = currentTime
                - this.opProcessingTimes.inboundPushEventTime;
            }

            const duration = currentTime - this.opProcessingTimes.submitOpEventTime;

            // One of the core expectations for Fluid service is to be fast.
            // When it's not the case, we want to learn about it and be able to investigate, so
            // raise awareness.
            // This also helps identify cases where it's due to client behavior (sending too many ops)
            // that results in overwhelming ordering service and thus starting to see long latencies.
            // The threshold could be adjusted, but ideally it stays  workload-agnostic, as service
            // performance impacts all workloads relying on service.
            const category = duration > latencyThreshold ? "error" : "performance";

            this.logger.sendPerformanceEvent({
                eventName: "OpRoundtripTime",
                sequenceNumber,
                referenceSequenceNumber: message.referenceSequenceNumber,
                duration,
                category,
                pingLatency: this.pingLatency,
                msnDistance: this.deltaManager.lastSequenceNumber - this.deltaManager.minimumSequenceNumber,
                ...this.opPerfData,
            });
            this.clientSequenceNumberForLatencyStatistics = undefined;
            this.opPerfData = {};
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
    logger: ITelemetryLogger) {
    new OpPerfTelemetry(clientId, deltaManager, logger);
}

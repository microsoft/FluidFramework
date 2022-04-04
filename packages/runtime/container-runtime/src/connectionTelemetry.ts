/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
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

type IOpPerfTelemetryRequiredProperties =
    /** Track how long op is sitting in inbound queue until it is processed */
    "durationInboundQueue" |
    /** Measure time outbound op is sitting in queue due to active batch */
    "durationOutboundQueue" |
    /** Time spent between DeltaManager's inbound "push" event until the DeltaManager "op" event */
    "durationInboundToProcessing" |
    /** Length of the DeltaManager's inbound queue at the time of the processing */
    "lenghtInboundQueue";

type IOpPerfTelemetryProperties =
    Pick<ITelemetryProperties, IOpPerfTelemetryRequiredProperties>;

/**
 * We collect the timing at various moments in time during the op processing.
 */
enum OpTimings {
    opSendTimeForLatencyStatistics,
    opTimeSittingInboundQueue,
    opTimeInboundPushEvent,
}
class OpPerfTelemetry {
    private pongCount: number = 0;
    private pingLatency: number | undefined;

    // Collab window tracking. This is timestamp of %1000 message.
    private sequenceNumberForMsnTracking: number | undefined;
    private msnTrackingTimestamp: number = 0;
    // To track round trip time for every %500 client message.
    private clientSequenceNumberForLatencyStatistics: number | undefined;

    private readonly opProcessingTimes: number | undefined[] = [];

    // Performance Data to be reported for ops round trips and processing.
    private opPerfData: IOpPerfTelemetryProperties = {
        durationInboundQueue: undefined,
        durationOutboundQueue: undefined,
        durationInboundToProcessing: undefined,
        lenghtInboundQueue: undefined,
    };

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
            this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue] = undefined;
            this.opProcessingTimes[OpTimings.opTimeInboundPushEvent] = undefined;
            this.opPerfData = {
                durationInboundQueue: undefined,
                durationOutboundQueue: undefined,
                durationInboundToProcessing: undefined,
                lenghtInboundQueue: undefined,
            };
            this.connectionOpSeqNumber = undefined;
            this.firstConnection = false;
        });

        this.deltaManager.outbound.on("push", (messages) => {
            for (const msg of messages) {
                if (msg.type === MessageType.Operation &&
                    this.clientSequenceNumberForLatencyStatistics === msg.clientSequenceNumber) {
                    assert(this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue] === undefined,
                        "OpTimeSittingInboundQueue should be undefined");
                    assert(this.opPerfData.durationInboundQueue === undefined,
                        "durationInboundQueue should be undefined");
                    this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue] = Date.now();

                    assert(this.opPerfData.durationOutboundQueue === undefined,
                        "durationOutboundQueue should be undefined");

                    assert(this.opProcessingTimes[OpTimings.opSendTimeForLatencyStatistics] !== undefined,
                        "opSendTimeForLatencyStatistics should be undefined");

                    this.opPerfData.durationOutboundQueue = this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue]
                        - this.opProcessingTimes[OpTimings.opSendTimeForLatencyStatistics];
                }
            }
        });

        this.deltaManager.inbound.on("push", (message: ISequencedDocumentMessage) => {
            if (this.clientId === message.clientId &&
                message.type === MessageType.Operation &&
                this.clientSequenceNumberForLatencyStatistics === message.clientSequenceNumber &&
                this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue] !== undefined) {
                this.opProcessingTimes[OpTimings.opTimeInboundPushEvent] = Date.now();
                this.opPerfData.durationInboundQueue = this.opProcessingTimes[OpTimings.opTimeInboundPushEvent]
                                     - this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue];
                this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue] = undefined;
                this.opPerfData.lenghtInboundQueue = this.deltaManager.inbound.length;
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
        this.pongCount++;
        this.pingLatency = latency;
        // logging one in every 100 pongs
        if (this.pongCount === 100) {
            this.logger.sendPerformanceEvent({
                eventName: "DeltaLatency",
                duration: latency,
            });
            this.pongCount = 0;
        }
    }

    private beforeOpSubmit(message: IDocumentMessage) {
        // start with first client op and measure latency every 500 client ops
        if (this.clientSequenceNumberForLatencyStatistics === undefined &&
            message.clientSequenceNumber % 500 === 1) {
            assert(this.opProcessingTimes[OpTimings.opTimeSittingInboundQueue] === undefined,
                "OpTimeSittingInboundQueue should be undefined");
            assert(this.opPerfData.durationInboundQueue === undefined,
                "durationInboundQueue should be undefined");
            this.opProcessingTimes[OpTimings.opSendTimeForLatencyStatistics] = Date.now();
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
                "msnTrackingTimestamp should not be undefined");
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
            assert(this.opProcessingTimes[OpTimings.opSendTimeForLatencyStatistics] !== undefined,
                0x120 /* "Undefined latency statistics (op send time)" */);
            const currentTime = Date.now();

            if (this.opProcessingTimes[OpTimings.opTimeInboundPushEvent] !== undefined) {
                this.opPerfData.durationInboundToProcessing = currentTime
                - this.opProcessingTimes[OpTimings.opTimeInboundPushEvent];
            }

            const duration = currentTime - this.opProcessingTimes[OpTimings.opSendTimeForLatencyStatistics];

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
            this.opPerfData = {
                durationInboundQueue: undefined,
                durationOutboundQueue: undefined,
                durationInboundToProcessing: undefined,
                lenghtInboundQueue: undefined,
            };
        }
    }
}

export function ReportOpPerfTelemetry(
    clientId: string | undefined,
    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
    logger: ITelemetryLogger) {
    new OpPerfTelemetry(clientId, deltaManager, logger);
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { performanceNow } from "@fluidframework/common-utils";

class OpPerfTelemetry {
    private pongCount: number = 0;
    private socketLatency = 0;

    // Collab window tracking. This is timestamp of %1000 message.
    private opSendTimeForLatencyStatisticsForMsnStatistics: number | undefined;

    // To track round trip time for every %1000 client message.
    private opSendTimeForLatencyStatistics: number | undefined;
    private clientSequenceNumberForLatencyStatistics: number | undefined;

    private firstConnection = true;
    private connectionOpSeqNumber: number | undefined;
    private readonly bootTime = performanceNow();
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
        this.deltaManager.on("beforeOpProcessing", (message) => this.beforeProcessingOp(message));
        this.deltaManager.on("connect", (details, opsBehind) => {
            this.clientId = details.clientId;
            this.clientSequenceNumberForLatencyStatistics = undefined;
            if (opsBehind !== undefined) {
                this.connectionOpSeqNumber = this.deltaManager.lastKnownSeqNumber;
                this.gap = opsBehind;
                this.connectionStartTime = performanceNow();

                // We might be already up-today. If so, report it right away.
                if (this.gap <= 0) {
                    this.reportGettingUpToDate();
                }
            }
        });
        this.deltaManager.on("disconnect", () => {
            this.connectionOpSeqNumber = undefined;
            this.firstConnection = false;
        });
        this.deltaManager.on("beforeOpProcessing", (message) => {
            if (message.sequenceNumber === this.connectionOpSeqNumber) {
                this.reportGettingUpToDate();
            }
        });
    }

    private reportGettingUpToDate() {
        this.connectionOpSeqNumber = undefined;
        this.logger.sendPerformanceEvent({
            eventName: "ConnectionSpeed",
            duration: performanceNow() - this.connectionStartTime,
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
        this.socketLatency += latency;
        const aggregateCount = 100;
        if (this.pongCount === aggregateCount) {
            this.logger.sendTelemetryEvent({ eventName: "DeltaLatency", value: this.socketLatency / aggregateCount });
            this.pongCount = 0;
            this.socketLatency = 0;
        }
    }

    private beforeOpSubmit(message: IDocumentMessage) {
        // start with first client op and measure latency every 500 client ops
        if (this.clientSequenceNumberForLatencyStatistics === undefined && message.clientSequenceNumber % 500 === 1) {
            this.opSendTimeForLatencyStatistics = Date.now();
            this.clientSequenceNumberForLatencyStatistics = message.clientSequenceNumber;
        }
    }

    private beforeProcessingOp(message: ISequencedDocumentMessage) {
        // Record collab window max size after every 1000th op.
        if (message.sequenceNumber % 1000 === 0) {
            if (this.opSendTimeForLatencyStatisticsForMsnStatistics !== undefined) {
                this.logger.sendTelemetryEvent({
                    eventName: "MsnStatistics",
                    sequenceNumber: message.sequenceNumber,
                    msnDistance: this.deltaManager.lastSequenceNumber - this.deltaManager.minimumSequenceNumber,
                    timeDelta: message.timestamp - this.opSendTimeForLatencyStatisticsForMsnStatistics,
                });
            }
            this.opSendTimeForLatencyStatisticsForMsnStatistics = message.timestamp;
        }

        if (this.clientId === message.clientId &&
            this.clientSequenceNumberForLatencyStatistics === message.clientSequenceNumber) {
            assert(this.opSendTimeForLatencyStatistics);
            this.logger.sendTelemetryEvent({
                eventName: "OpRoundtripTime",
                seqNumber: message.sequenceNumber,
                clientSequenceNumber: message.clientSequenceNumber,
                value: Date.now() - this.opSendTimeForLatencyStatistics,
            });
            this.clientSequenceNumberForLatencyStatistics = undefined;
        }
    }
}

export function ReportOpPerfTelemetry(
    clientId: string | undefined,
    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
    logger: ITelemetryLogger) {
    new OpPerfTelemetry(clientId, deltaManager, logger);
}

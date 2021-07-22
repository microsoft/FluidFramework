/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Timer } from "@fluidframework/common-utils";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ISummarizeHeuristicData, ISummarizeHeuristicRunner, ISummaryAttempt } from "./summarizerTypes";
import { SummarizeReason } from "./summaryGenerator";

/** Simple implementation of class for tracking summarize heuristic data. */
export class SummarizeHeuristicData implements ISummarizeHeuristicData {
    protected _lastAttempt: ISummaryAttempt;
    public get lastAttempt(): ISummaryAttempt {
        return this._lastAttempt;
    }

    protected _lastAck: ISummaryAttempt;
    public get lastAck(): ISummaryAttempt {
        return this._lastAck;
    }

    constructor(
        public lastOpSequenceNumber: number,
        firstAck: ISummaryAttempt,
    ) {
        this._lastAttempt = firstAck;
        this._lastAck = firstAck;
    }

    public initialize(lastSummary: ISummaryAttempt) {
        this._lastAttempt = lastSummary;
        this._lastAck = lastSummary;
    }

    public recordAttempt(refSequenceNumber?: number) {
        this._lastAttempt = {
            refSequenceNumber: refSequenceNumber ?? this.lastOpSequenceNumber,
            summaryTime: Date.now(),
        };
    }

    public ackLastSent() {
        this._lastAck = this.lastAttempt;
    }
}

/**
 * This class contains the heuristics for when to summarize.
 */
export class SummarizeHeuristicRunner implements ISummarizeHeuristicRunner {
    private readonly idleTimer: Timer;

    public constructor(
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly configuration: ISummaryConfiguration,
        private readonly trySummarize: (reason: SummarizeReason) => void,
        private readonly minOpsForAttemptOnClose = 50,
    ) {
        this.idleTimer = new Timer(
            this.configuration.idleTime,
            () => this.trySummarize("idle"));
    }

    public countOpsSinceLastAck(): number {
        return this.heuristicData.lastOpSequenceNumber - this.heuristicData.lastAck.refSequenceNumber;
    }

    public run() {
        const timeSinceLastSummary = Date.now() - this.heuristicData.lastAck.summaryTime;
        const outstandingOps = this.countOpsSinceLastAck();
        if (timeSinceLastSummary > this.configuration.maxTime) {
            this.idleTimer.clear();
            this.trySummarize("maxTime");
        } else if (outstandingOps > this.configuration.maxOps) {
            this.idleTimer.clear();
            this.trySummarize("maxOps");
        } else {
            this.idleTimer.restart();
        }
    }

    public runOnClose(): boolean {
        const outstandingOps = this.countOpsSinceLastAck();
        if (outstandingOps > this.minOpsForAttemptOnClose) {
            this.trySummarize("lastSummary");
            return true;
        }
        return false;
    }

    public dispose() {
        this.idleTimer.clear();
    }
}

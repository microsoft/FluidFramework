/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Timer } from "@fluidframework/common-utils";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ISummarizerHeuristics, ISummaryAttempt } from "./summarizerTypes";
import { SummarizeReason } from "./summaryGenerator";

const minOpsForLastSummary = 50;

class BaseSummarizerHeuristics {
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
export class DefaultSummarizerHeuristics extends BaseSummarizerHeuristics implements ISummarizerHeuristics {
    private readonly idleTimer: Timer;

    public constructor(
        private readonly configuration: ISummaryConfiguration,
        private readonly trySummarize: (reason: SummarizeReason) => void,
        lastOpSequenceNumber: number,
        firstAck: ISummaryAttempt,
    ) {
        super(lastOpSequenceNumber, firstAck);
        this.idleTimer = new Timer(
            this.configuration.idleTime,
            () => this.trySummarize("idle"));
    }

    public run() {
        const timeSinceLastSummary = Date.now() - this.lastAck.summaryTime;
        const opCountSinceLastSummary = this.lastOpSequenceNumber - this.lastAck.refSequenceNumber;
        if (timeSinceLastSummary > this.configuration.maxTime) {
            this.idleTimer.clear();
            this.trySummarize("maxTime");
        } else if (opCountSinceLastSummary > this.configuration.maxOps) {
            this.idleTimer.clear();
            this.trySummarize("maxOps");
        } else {
            this.idleTimer.restart();
        }
    }

    public runOnClose(): boolean {
        const outstandingOps = this.lastOpSequenceNumber - this.lastAck.refSequenceNumber;
        if (outstandingOps > minOpsForLastSummary) {
            this.trySummarize("lastSummary");
            return true;
        }
        return false;
    }

    public dispose() {
        this.idleTimer.clear();
    }
}

export class DisabledSummarizerHeuristics extends BaseSummarizerHeuristics implements ISummarizerHeuristics {
    public run() {
        // Intentionally do nothing; heuristics are disabled.
    }

    public dispose() {
        // Intentionally do nothing; no resources to dispose.
    }

    public runOnClose() {
        // Intentionally do nothing; heuristics are disabled.
        return false;
    }
}

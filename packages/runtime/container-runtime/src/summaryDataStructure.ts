/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-core-utils";
import {
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";

export interface ISummaryMessage extends ISequencedDocumentMessage {
    type: MessageType.Summarize;
    contents: ISummaryContent;
}

export interface ISummaryAckMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryAck;
    contents: ISummaryAck;
}

export interface ISummaryNackMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryNack;
    contents: ISummaryNack;
}

export interface ISummary {
    readonly clientId: string;
    readonly clientSequenceNumber: number;
    readonly summaryOp?: ISummaryMessage;
    readonly summaryAckNack?: ISummaryAckMessage | ISummaryNackMessage;
    isBroadcast(): boolean;
    isAckedNacked(): boolean;
    waitBroadcast(): Promise<ISummaryMessage>;
    waitAckNack(): Promise<ISummaryAckMessage | ISummaryNackMessage>;
}

export interface IAckedSummary extends ISummary {
    readonly summaryOp: ISummaryMessage;
    readonly summaryAckNack: ISummaryAckMessage;
    isBroadcast(): true;
    isAckedNacked(): true;
}

enum SummaryState {
    Local = 0,
    Broadcast = 1,
    Acked = 2,
    Nacked = -1,
}

class Summary implements ISummary {
    public static createLocal(clientId: string, clientSequenceNumber: number) {
        return new Summary(clientId, clientSequenceNumber);
    }
    public static createFromOp(op: ISummaryMessage) {
        const summary = new Summary(op.clientId, op.clientSequenceNumber);
        summary.broadcast(op);
        return summary;
    }

    private state = SummaryState.Local;

    private _summaryOp?: ISummaryMessage;
    private _summaryAckNack?: ISummaryAckMessage | ISummaryNackMessage;

    private readonly defSummaryOp = new Deferred<void>();
    private readonly defSummaryAck = new Deferred<void>();

    public get summaryOp() { return this._summaryOp; }
    public get summaryAckNack() { return this._summaryAckNack; }

    private constructor(
        public readonly clientId: string,
        public readonly clientSequenceNumber: number) {}

    public isBroadcast(): boolean {
        return this.state !== SummaryState.Local;
    }
    public isAckedNacked(): boolean {
        return this.state === SummaryState.Acked || this.state === SummaryState.Nacked;
    }
    public isAcked(): this is IAckedSummary {
        return this.state === SummaryState.Acked;
    }

    public broadcast(op: ISummaryMessage) {
        assert(this.state === SummaryState.Local);
        this._summaryOp = op;
        this.defSummaryOp.resolve();
        this.state = SummaryState.Broadcast;
        return true;
    }

    public ack(op: ISummaryAckMessage): this is IAckedSummary {
        assert.strictEqual(op.type, MessageType.SummaryAck);
        this.ackNack(op);
        return true;
    }

    public ackNack(op: ISummaryAckMessage | ISummaryNackMessage) {
        assert(this.state === SummaryState.Broadcast);
        this._summaryAckNack = op;
        this.defSummaryAck.resolve();
        this.state = op.type === MessageType.SummaryAck ? SummaryState.Acked : SummaryState.Nacked;
        return true;
    }

    public async waitBroadcast(): Promise<ISummaryMessage> {
        if (!this.isBroadcast()) {
            await this.defSummaryOp.promise;
        }
        return this._summaryOp;
    }

    public async waitAckNack(): Promise<ISummaryAckMessage | ISummaryNackMessage> {
        if (!this.isAckedNacked()) {
            await this.defSummaryAck.promise;
        }
        return this._summaryAckNack;
    }
}

export interface IClientSummaryWatcher {
    watchSummary(clientSequenceNumber: number): ISummary;
    waitFlushed(): Promise<IAckedSummary | undefined>;
}

class SummaryWatcher implements IClientSummaryWatcher {
    // key: clientSeqNum
    private readonly localSummaries = new Map<number, Summary>();

    public constructor(
        public readonly clientId: string,
        private readonly summaryDataStructure: SummaryDataStructure,
    ) {}

    public watchSummary(clientSequenceNumber: number): ISummary {
        let summary = this.localSummaries.get(clientSequenceNumber);
        if (!summary) {
            summary = Summary.createLocal(this.clientId, clientSequenceNumber);
            this.localSummaries.set(summary.clientSequenceNumber, summary);
        }
        return summary;
    }

    public waitFlushed() {
        return this.summaryDataStructure.waitFlushed();
    }

    public tryGetSummary(clientSequenceNumber: number) {
        return this.localSummaries.get(clientSequenceNumber);
    }

    public setSummary(summary: Summary) {
        this.localSummaries.set(summary.clientSequenceNumber, summary);
    }
}

export class SummaryDataStructure {
    // key: clientId
    private readonly summaryWatchers = new Map<string, SummaryWatcher>();
    // key: summarySeqNum
    private readonly pendingSummaries = new Map<number, Summary>();
    private readonly ackedSummaries = new Map<number, Summary>();
    private readonly nacks = new Map<number, ISummaryNackMessage>();
    private readonly initialAck = new Deferred<IAckedSummary | undefined>();

    private lastAck?: IAckedSummary;

    private initialized = false;
    public get isInitialized() { return this.initialized; }

    public constructor(
        public readonly initialSequenceNumber: number,
        private readonly logger: ITelemetryLogger,
    ) {
        if (this.initialSequenceNumber === 0) {
            this.initialized = true;
            this.initialAck.resolve();
        }
    }

    public createWatcher(clientId: string): IClientSummaryWatcher {
        const watcher = new SummaryWatcher(clientId, this);
        this.summaryWatchers.set(clientId, watcher);
        return watcher;
    }

    public waitInitialized(): Promise<IAckedSummary | undefined> {
        return this.initialAck.promise;
    }

    public async waitFlushed(): Promise<IAckedSummary | undefined> {
        while (this.pendingSummaries.size > 0) {
            const promises = Array.from(this.pendingSummaries, ([, summary]) => summary.waitAckNack());
            await Promise.all(promises);
        }
        return this.lastAck;
    }

    public handleOp(op: ISequencedDocumentMessage) {
        switch (op.type) {
            case MessageType.Summarize: {
                this.handleSummaryOp(op as ISummaryMessage);
                return;
            }
            case MessageType.SummaryAck: {
                this.handleSummaryAck(op as ISummaryAckMessage);
                return;
            }
            case MessageType.SummaryNack: {
                this.handleSummaryNack(op as ISummaryNackMessage);
                return;
            }
            default: {
                return;
            }
        }
    }

    private handleSummaryOp(op: ISummaryMessage) {
        let summary: Summary | undefined;

        // check if summary already being watched, broadcast if so
        const watcher = this.summaryWatchers.get(op.clientId);
        if (watcher) {
            summary = watcher.tryGetSummary(op.clientSequenceNumber);
            if (summary) {
                summary.broadcast(op);
            }
        }

        // if not watched, create from op
        if (!summary) {
            summary = Summary.createFromOp(op);
            if (watcher) {
                watcher.setSummary(summary);
            }
        }
        this.pendingSummaries.set(op.sequenceNumber, summary);

        // initialize
        if (!this.initialized && summary.summaryOp.referenceSequenceNumber === this.initialSequenceNumber) {
            summary.waitAckNack().then(() => this.checkInitialized(summary)).catch((error) => {
                this.logger.sendErrorEvent({ eventName: "ErrorCheckingInitialized" }, error);
            });
        }
    }

    private handleSummaryAck(op: ISummaryAckMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        const summary = this.pendingSummaries.get(seq);
        assert(summary); // we should never see an ack without an op
        summary.ackNack(op);
        this.pendingSummaries.delete(seq);
        this.ackedSummaries.set(seq, summary);

        // track latest ack
        if (!this.lastAck || seq > this.lastAck.summaryAckNack.contents.summaryProposal.summarySequenceNumber) {
            this.lastAck = summary as IAckedSummary;
        }
    }

    private handleSummaryNack(op: ISummaryNackMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        const summary = this.pendingSummaries.get(seq);
        if (summary) {
            summary.ackNack(op);
            this.pendingSummaries.delete(seq);
        }
        this.nacks.set(seq, op);
    }

    private checkInitialized(summary: Summary) {
        if (this.initialized) {
            return;
        }
        if (summary.isAcked()) {
            this.initialized = true;
            this.initialAck.resolve(summary);
        }
    }
}

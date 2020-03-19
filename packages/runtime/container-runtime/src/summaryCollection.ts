/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IDisposable } from "@microsoft/fluid-common-definitions";
import { Deferred } from "@microsoft/fluid-common-utils";
import {
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";

/**
 * Interface for summary op messages with typed contents.
 */
export interface ISummaryOpMessage extends ISequencedDocumentMessage {
    type: MessageType.Summarize;
    contents: ISummaryContent;
}

/**
 * Interface for summary ack messages with typed contents.
 */
export interface ISummaryAckMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryAck;
    contents: ISummaryAck;
}

/**
 * Interface for summary nack messages with typed contents.
 */
export interface ISummaryNackMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryNack;
    contents: ISummaryNack;
}

/**
 * A single summary which can be tracked as it goes through its life cycle.
 * The life cycle is: Local to Broadcast to Acked/Nacked.
 */
export interface ISummary {
    readonly clientId: string;
    readonly clientSequenceNumber: number;
    waitBroadcast(): Promise<ISummaryOpMessage>;
    waitAckNack(): Promise<ISummaryAckMessage | ISummaryNackMessage>;
}

/**
 * A single summary which has already been acked by the server.
 */
export interface IAckedSummary extends ISummary {
    readonly summaryOp: ISummaryOpMessage;
    readonly summaryAckNack: ISummaryAckMessage;
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
    public static createFromOp(op: ISummaryOpMessage) {
        const summary = new Summary(op.clientId, op.clientSequenceNumber);
        summary.broadcast(op);
        return summary;
    }

    private state = SummaryState.Local;

    private _summaryOp?: ISummaryOpMessage;
    private _summaryAckNack?: ISummaryAckMessage | ISummaryNackMessage;

    private readonly defSummaryOp = new Deferred<void>();
    private readonly defSummaryAck = new Deferred<void>();

    public get summaryOp() { return this._summaryOp; }
    public get summaryAckNack() { return this._summaryAckNack; }

    private constructor(
        public readonly clientId: string,
        public readonly clientSequenceNumber: number) { }

    public hasBeenAcked(): this is IAckedSummary {
        return this.state === SummaryState.Acked;
    }

    public broadcast(op: ISummaryOpMessage) {
        assert(this.state === SummaryState.Local);
        this._summaryOp = op;
        this.defSummaryOp.resolve();
        this.state = SummaryState.Broadcast;
        return true;
    }

    public ackNack(op: ISummaryAckMessage | ISummaryNackMessage) {
        assert(this.state === SummaryState.Broadcast);
        this._summaryAckNack = op;
        this.defSummaryAck.resolve();
        this.state = op.type === MessageType.SummaryAck ? SummaryState.Acked : SummaryState.Nacked;
        return true;
    }

    public async waitBroadcast(): Promise<ISummaryOpMessage> {
        await this.defSummaryOp.promise;
        // eslint-disable-next-line max-len
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
        return this._summaryOp!;
    }

    public async waitAckNack(): Promise<ISummaryAckMessage | ISummaryNackMessage> {
        await this.defSummaryAck.promise;
        // eslint-disable-next-line max-len
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
        return this._summaryAckNack!;
    }
}

/**
 * Watches summaries created by a specific client.
 */
export interface IClientSummaryWatcher extends IDisposable {
    watchSummary(clientSequenceNumber: number): ISummary;
    waitFlushed(): Promise<IAckedSummary | undefined>;
}

/**
 * This class watches summaries created by a specific client.
 * It should be created and managed from a SummaryCollection.
 */
class ClientSummaryWatcher implements IClientSummaryWatcher {
    // key: clientSeqNum
    private readonly localSummaries = new Map<number, Summary>();
    private _disposed = false;

    public get disposed() { return this._disposed; }

    public constructor(
        public readonly clientId: string,
        private readonly summaryCollection: SummaryCollection,
    ) { }

    /**
     * Watches for a specific sent summary op.
     * @param clientSequenceNumber - client sequence number of sent summary op
     */
    public watchSummary(clientSequenceNumber: number): ISummary {
        let summary = this.localSummaries.get(clientSequenceNumber);
        if (!summary) {
            summary = Summary.createLocal(this.clientId, clientSequenceNumber);
            this.localSummaries.set(summary.clientSequenceNumber, summary);
        }
        return summary;
    }

    /**
     * Waits until all of the pending summaries in the underlying SummaryCollection
     * are acked/nacked.
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public waitFlushed() {
        return this.summaryCollection.waitFlushed();
    }

    /**
     * Gets a watched summary or returns undefined if not watched.
     * @param clientSequenceNumber - client sequence number of sent summary op
     */
    public tryGetSummary(clientSequenceNumber: number) {
        return this.localSummaries.get(clientSequenceNumber);
    }

    /**
     * Starts watching a summary made by this client.
     * @param summary - summary to start watching
     */
    public setSummary(summary: Summary) {
        this.localSummaries.set(summary.clientSequenceNumber, summary);
    }

    public dispose() {
        this.summaryCollection.removeWatcher(this.clientId);
        this._disposed = true;
    }
}

/**
 * Data structure that looks at the op stream to track summaries as they
 * are broadcast, acked and nacked.
 * It provides functionality for watching specific summaries.
 */
export class SummaryCollection {
    // key: clientId
    private readonly summaryWatchers = new Map<string, ClientSummaryWatcher>();
    // key: summarySeqNum
    private readonly pendingSummaries = new Map<number, Summary>();
    private refreshWaitNextAck = new Deferred<void>();

    private lastAck?: IAckedSummary;

    public get latestAck() { return this.lastAck; }

    public constructor(public readonly initialSequenceNumber: number) { }

    /**
     * Creates and returns a summary watcher for a specific client.
     * This will allow for local sent summaries to be better tracked.
     * @param clientId - client id for watcher
     */
    public createWatcher(clientId: string): IClientSummaryWatcher {
        const watcher = new ClientSummaryWatcher(clientId, this);
        this.summaryWatchers.set(clientId, watcher);
        return watcher;
    }

    public removeWatcher(clientId: string) {
        this.summaryWatchers.delete(clientId);
    }

    /**
     * Returns a promise that resolves once all pending summary ops
     * have been acked or nacked.
     */
    public async waitFlushed(): Promise<IAckedSummary | undefined> {
        while (this.pendingSummaries.size > 0) {
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            const promises = Array.from(this.pendingSummaries, ([, summary]) => summary.waitAckNack());
            await Promise.all(promises);
        }
        return this.lastAck;
    }

    /**
     * Returns a promise that resolves once a summary is acked that has a reference
     * sequence number greater than or equal to the passed in sequence number.
     * @param referenceSequenceNumber - reference sequence number to wait for
     * @returns The latest acked summary
     */
    public async waitSummaryAck(referenceSequenceNumber: number): Promise<IAckedSummary> {
        while (!this.lastAck || this.lastAck.summaryOp.referenceSequenceNumber < referenceSequenceNumber) {
            await this.refreshWaitNextAck.promise;
        }
        return this.lastAck;
    }

    /**
     * Handler for ops; only handles ops relating to summaries.
     * @param op - op message to handle
     */
    public handleOp(op: ISequencedDocumentMessage) {
        switch (op.type) {
            case MessageType.Summarize: {
                this.handleSummaryOp(op as ISummaryOpMessage);
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

    private handleSummaryOp(op: ISummaryOpMessage) {
        let summary: Summary | undefined;

        // Check if summary already being watched, broadcast if so
        const watcher = this.summaryWatchers.get(op.clientId);
        if (watcher) {
            summary = watcher.tryGetSummary(op.clientSequenceNumber);
            if (summary) {
                summary.broadcast(op);
            }
        }

        // If not watched, create from op
        if (!summary) {
            summary = Summary.createFromOp(op);
            if (watcher) {
                watcher.setSummary(summary);
            }
        }
        this.pendingSummaries.set(op.sequenceNumber, summary);
    }

    private handleSummaryAck(op: ISummaryAckMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const summary = this.pendingSummaries.get(seq)!;
        assert(summary); // We should never see an ack without an op
        summary.ackNack(op);
        this.pendingSummaries.delete(seq);

        // Track latest ack
        if (!this.lastAck || seq > this.lastAck.summaryAckNack.contents.summaryProposal.summarySequenceNumber) {
            this.lastAck = summary as IAckedSummary;
            this.refreshWaitNextAck.resolve();
            this.refreshWaitNextAck = new Deferred<void>();
        }
    }

    private handleSummaryNack(op: ISummaryNackMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        const summary = this.pendingSummaries.get(seq);
        if (summary) {
            summary.ackNack(op);
            this.pendingSummaries.delete(seq);
        }
    }
}

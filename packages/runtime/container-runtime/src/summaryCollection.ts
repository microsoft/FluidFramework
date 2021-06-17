/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { Deferred, assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    MessageType,
} from "@fluidframework/protocol-definitions";

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
export interface IAckedSummary {
    readonly summaryOp: ISummaryOpMessage;
    readonly summaryAck: ISummaryAckMessage;
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
        assert(this.state === SummaryState.Local, 0x175 /* "Can only broadcast if summarizer starts in local state" */);
        this._summaryOp = op;
        this.defSummaryOp.resolve();
        this.state = SummaryState.Broadcast;
        return true;
    }

    public ackNack(op: ISummaryAckMessage | ISummaryNackMessage) {
        assert(this.state === SummaryState.Broadcast,
            0x176 /* "Can only ack/nack if summarizer is in broadcasting state" */);
        this._summaryAckNack = op;
        this.defSummaryAck.resolve();
        this.state = op.type === MessageType.SummaryAck ? SummaryState.Acked : SummaryState.Nacked;
        return true;
    }

    public async waitBroadcast(): Promise<ISummaryOpMessage> {
        await this.defSummaryOp.promise;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this._summaryOp!;
    }

    public async waitAckNack(): Promise<ISummaryAckMessage | ISummaryNackMessage> {
        await this.defSummaryAck.promise;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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

export type OpActionEventName = MessageType.Summarize | MessageType.SummaryAck | MessageType.SummaryNack | "default";
export type OpActionEventListener = (op: ISequencedDocumentMessage) => void;
export interface ISummaryCollectionOpEvents extends IEvent {
    (event: OpActionEventName, listener: OpActionEventListener);
}

/**
 * Data structure that looks at the op stream to track summaries as they
 * are broadcast, acked and nacked.
 * It provides functionality for watching specific summaries.
 */
export class SummaryCollection extends TypedEventEmitter<ISummaryCollectionOpEvents> {
    // key: clientId
    private readonly summaryWatchers = new Map<string, ClientSummaryWatcher>();
    // key: summarySeqNum
    private readonly pendingSummaries = new Map<number, Summary>();
    private refreshWaitNextAck = new Deferred<void>();

    private lastSummaryTimestamp: number | undefined;
    private maxAckWaitTime: number | undefined;
    private pendingAckTimerTimeoutCallback: (() => void) | undefined;
    private lastAck: IAckedSummary | undefined;

    public get latestAck(): IAckedSummary | undefined { return this.lastAck; }

    public emit(event: OpActionEventName, ...args: Parameters<OpActionEventListener>): boolean {
        return super.emit(event, ...args);
    }

    public get opsSinceLastAck() {
        return this.deltaManager.lastSequenceNumber -
            (this.lastAck?.summaryAck.sequenceNumber ?? this.deltaManager.initialSequenceNumber);
    }

    public constructor(
        private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly logger: ITelemetryLogger,
    ) {
        super();
        this.deltaManager.on(
            "op",
            (op) => this.handleOp(op));
    }

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

    public setPendingAckTimerTimeoutCallback(maxAckWaitTime: number, timeoutCallback: () => void) {
        this.maxAckWaitTime = maxAckWaitTime;
        this.pendingAckTimerTimeoutCallback = timeoutCallback;
    }

    public unsetPendingAckTimerTimeoutCallback() {
        this.maxAckWaitTime = undefined;
        this.pendingAckTimerTimeoutCallback = undefined;
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
    private handleOp(op: ISequencedDocumentMessage) {
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
                // If the difference between timestamp of current op and last summary op is greater than
                // the maxAckWaitTime, then we need to inform summarizer to not wait and summarize
                // immediately as we have already waited for maxAckWaitTime.
                const lastOpTimestamp = op.timestamp;
                if (this.lastSummaryTimestamp !== undefined &&
                    this.maxAckWaitTime !== undefined &&
                    lastOpTimestamp - this.lastSummaryTimestamp >= this.maxAckWaitTime
                ) {
                    this.pendingAckTimerTimeoutCallback?.();
                }
                this.emit("default", op);

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
        this.lastSummaryTimestamp = op.timestamp;
        this.emit(MessageType.Summarize, op);
    }

    private handleSummaryAck(op: ISummaryAckMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        const summary = this.pendingSummaries.get(seq);
        if (!summary || summary.summaryOp === undefined) {
            // Summary ack without an op should be rare. We could fetch the
            // reference sequence number from the snapshot, but instead we
            // will not emit this ack. It should be the case that the summary
            // op that this ack is for is earlier than this file was loaded
            // from. i.e. initialSequenceNumber > summarySequenceNumber.
            // We really don't care about it for now, since it is older than
            // the one we loaded from.
            if (seq >= this.deltaManager.initialSequenceNumber) {
                // Potential causes for it to be later than our initialSequenceNumber
                // are that the summaryOp was nacked then acked, double-acked, or
                // the summarySequenceNumber is incorrect.
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWithoutOp",
                    sequenceNumber: op.sequenceNumber, // summary ack seq #
                    summarySequenceNumber: seq, // missing summary seq #
                    initialSequenceNumber: this.deltaManager.initialSequenceNumber,
                });
            }
            return;
        }
        summary.ackNack(op);
        this.pendingSummaries.delete(seq);

        // Track latest ack
        if (!this.lastAck || seq > this.lastAck.summaryAck.contents.summaryProposal.summarySequenceNumber) {
            this.lastAck = {
                summaryOp: summary.summaryOp,
                summaryAck: op,
            };
            this.refreshWaitNextAck.resolve();
            this.refreshWaitNextAck = new Deferred<void>();
            this.emit(MessageType.SummaryAck, op);
        }
    }

    private handleSummaryNack(op: ISummaryNackMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        const summary = this.pendingSummaries.get(seq);
        if (summary) {
            summary.ackNack(op);
            this.pendingSummaries.delete(seq);
            this.emit(MessageType.SummaryNack, op);
        }
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { TypedEventEmitter, assert } from "@fluidframework/common-utils";
import { IConnectionDetails, IDeltaHandlerStrategy, IDeltaQueue, IDeltaQueueEvents } from "@fluidframework/container-definitions";
import { IDocumentService } from "@fluidframework/driver-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IConnectionManager, IConnectionManagerFactoryArgs } from "./contracts";
import { DeltaManager } from "./deltaManager";

const GroupedBatchOpType = "groupedBatch";

class VirtualDeltaQueueProxy<T> extends TypedEventEmitter<IDeltaQueueEvents<T>> implements IDeltaQueue<T> {
    private readonly _trackedListeners: Map<string, (...args: any[]) => void> = new Map();

    constructor(
        private readonly _queue: IDeltaQueue<T>,
        private readonly _virtualizeValue: (value: T) => T,
    ) {
        super();

        this.on("newListener", (event, _listener) => {
            assert((this.listeners(event).length !== 0) === this._trackedListeners.has(event), "mismatch");
            if (!this._trackedListeners.has(event)) {
                let listener: (...args: any[]) => void;

                // eslint-disable-next-line unicorn/prefer-ternary
                if (event === "push" || event === "op") {
                    listener = (task: T) => { this.emit(event, this._virtualizeValue(task)); }
                } else {
                    listener = (...args: any[]) => { this.emit(event, ...args); };
                }

                this.addTrackedListener(event, listener);
            }
        });
    }

    private addTrackedListener(event: string, listener: (...args: any[]) => void) {
        (this._queue as any).on(event, listener); // TODO: find better cast than "any"
        assert(!this._trackedListeners.has(event), "double tracked listener");
        this._trackedListeners.set(event, listener);
    }

    private removeTrackedListeners() {
        for (const [event, listener] of this._trackedListeners.entries()) {
            (this._queue as any).off(event, listener); // TODO: find better cast than "any"
        }
        this._trackedListeners.clear();
    }

    public peek(): T | undefined {
        const value = this._queue.peek();
        return value !== undefined ? this._virtualizeValue(value) : undefined;
    }

    public toArray(): T[] {
        return this._queue.toArray().map((it) => this._virtualizeValue(it));
    }

    public dispose(error?: Error | undefined): void {
        this.removeTrackedListeners();
        return this._queue.dispose(error);
    }

    public get paused(): boolean {
        return this._queue.paused;
    }

    public get length(): number {
        return this._queue.length;
    }

    public get idle(): boolean {
        return this._queue.idle;
    }

    public get disposed(): boolean {
        return this._queue.disposed;
    }

    public async pause(): Promise<void> {
        return this._queue.pause();
    }

    public resume(): void {
        return this._queue.resume();
    }

    public async waitTillProcessingDone(): Promise<{ count: number; duration: number; }> {
        return this._queue.waitTillProcessingDone();
    }
}

export class VirtualDeltaManager<TConnectionManager extends IConnectionManager>
    extends DeltaManager<TConnectionManager> {

    private _virtualSequenceNumber = 0;
    private _clientSequenceNumber = 0;

    /**
     * Key: real client sequence number
     * Value: virtual client sequence number
     */
    private readonly _clientSequenceNumberMap = new Map<number, number>();

    /**
     * TODO: removal of entries based on minimumSequenceNumber?
     * Key: real sequence number
     * Value: virtual sequence number
     */
    private readonly _sequenceNumberMap = new Map<number, number>();

    private readonly _virtualizedInbound: IDeltaQueue<ISequencedDocumentMessage>;
    private readonly _virtualizedOutbound: IDeltaQueue<IDocumentMessage[]>;

    public get inbound(): IDeltaQueue<ISequencedDocumentMessage> {
        return this._virtualizedInbound;
    }

    public get outbound(): IDeltaQueue<IDocumentMessage[]> {
        return this._virtualizedOutbound;
    }

    constructor(
        serviceProvider: () => IDocumentService | undefined,
        logger: ITelemetryLogger,
        active: () => boolean,
        createConnectionManager: (props: IConnectionManagerFactoryArgs) => TConnectionManager,
    ) {
        super(serviceProvider, logger, active, createConnectionManager);
        this._virtualizedInbound = new VirtualDeltaQueueProxy(
            this._inbound,
            (message: ISequencedDocumentMessage) => {
                return this.virtualizeSequencedMessage(message);
            });
        this._virtualizedOutbound = new VirtualDeltaQueueProxy(
            this.connectionManager.outbound,
            (messages: IDocumentMessage[]) => {
                return messages.map((message) => {
                    return {
                        ...message,
                        referenceSequenceNumber: this.virtualizeSequenceNumber(message.referenceSequenceNumber),
                        clientSequenceNumber: this.virtualizeClientSequenceNumber(message.clientSequenceNumber),
                    }
                });
            });
    }

    public async attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        term: number,
        handler: IDeltaHandlerStrategy,
        prefetchType: "cached" | "all" | "none" = "none",
    ) {
        this._virtualSequenceNumber = sequenceNumber;

        this._sequenceNumberMap.set(sequenceNumber, sequenceNumber);
        this._sequenceNumberMap.set(minSequenceNumber, minSequenceNumber);

        return super.attachOpHandler(minSequenceNumber, sequenceNumber, term, handler, prefetchType);
    }

    protected connectHandler(connection: IConnectionDetails) {
        // TODO: do we need to do tracking here?
        super.connectHandler(connection);
    }

    protected sendMessageToConnectionManager(messages: IDocumentMessage[]): void {
        if (messages.length >= 2) {
            this.connectionManager.sendMessages([{
                type: GroupedBatchOpType,
                clientSequenceNumber: ++this._clientSequenceNumber,
                referenceSequenceNumber: messages[0].referenceSequenceNumber, // use oldest referenceSequenceNumber
                contents: messages,
            }]);
        } else {
            this.connectionManager.sendMessages(messages.map((it: IDocumentMessage) => {
                this._clientSequenceNumberMap.set(++this._clientSequenceNumber, it.clientSequenceNumber);
                return {...it, clientSequenceNumber: this._clientSequenceNumber};
            }));
        }
    }

    protected processMessage(message: ISequencedDocumentMessage, startTime: number): void {
        if (message.type === GroupedBatchOpType) {
            for (const subMessage of message.contents as IDocumentMessage[]) {
                this._sequenceNumberMap.set(message.sequenceNumber, ++this._virtualSequenceNumber); // We store last sequenceNumber of group
                super.processMessage({
                    ...message, // This will override the property difference between ISequencedDocumentMessage and IDocumentMessage
                    ...subMessage,
                    sequenceNumber: this._virtualSequenceNumber,
                    clientSequenceNumber: subMessage.clientSequenceNumber, // This number is already virtualized
                    referenceSequenceNumber: this.virtualizeSequenceNumber(subMessage.referenceSequenceNumber),
                    minimumSequenceNumber: this.virtualizeSequenceNumber(message.minimumSequenceNumber),
                }, startTime);
            }
        } else {
            this._sequenceNumberMap.set(message.sequenceNumber, ++this._virtualSequenceNumber);
            super.processMessage({
                ...message,
                sequenceNumber: this._virtualSequenceNumber,
                clientSequenceNumber: this.virtualizeClientSequenceNumber(message.clientSequenceNumber),
                referenceSequenceNumber: this.virtualizeSequenceNumber(message.referenceSequenceNumber),
                minimumSequenceNumber: this.virtualizeSequenceNumber(message.minimumSequenceNumber),
            }, startTime);
        }
    }

    private virtualizeSequenceNumber(sequenceNumber: number): number {
        const virtualizedSequenceNumber = this._sequenceNumberMap.get(sequenceNumber);
        assert(virtualizedSequenceNumber !== undefined, "sequenceNumber not found");

        return virtualizedSequenceNumber;
    }

    private virtualizeClientSequenceNumber(clientSequenceNumber: number): number {
        const virtualizedClientSequenceNumber = this._clientSequenceNumberMap.get(clientSequenceNumber);
        assert(virtualizedClientSequenceNumber !== undefined, "clientSequenceNumber not found");
        this._clientSequenceNumberMap.delete(clientSequenceNumber);

        return virtualizedClientSequenceNumber;
    }

    private virtualizeSequencedMessage(message: ISequencedDocumentMessage): ISequencedDocumentMessage {
        return {
            ...message,
            sequenceNumber: this.virtualizeSequenceNumber(message.sequenceNumber),
            referenceSequenceNumber: this.virtualizeSequenceNumber(message.referenceSequenceNumber),
            minimumSequenceNumber: this.virtualizeSequenceNumber(message.minimumSequenceNumber),
            clientSequenceNumber: this.virtualizeClientSequenceNumber(message.clientSequenceNumber),
        };
    }

    // TODO: virtualize this number
    public get initialSequenceNumber(): number {
        return this.initSequenceNumber;
    }

    public get lastSequenceNumber(): number {
        return this.virtualizeSequenceNumber(this.lastProcessedSequenceNumber);
    }

    public get lastMessage() {
        return this.lastProcessedMessage !== undefined ? this.virtualizeSequencedMessage(this.lastProcessedMessage) : undefined;
    }

    public get lastKnownSeqNumber() {
        // This variable now refers to virtual sequence number
        return this.virtualizeSequenceNumber(this.lastObservedSeqNumber);
    }

    public get minimumSequenceNumber(): number {
        return this.virtualizeSequenceNumber(this.minSequenceNumber);
    }
}

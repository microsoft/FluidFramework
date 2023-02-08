/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { TypedEventEmitter, assert } from "@fluidframework/common-utils";
import { IConnectionDetails, IDeltaHandlerStrategy, IDeltaQueue, IDeltaQueueEvents } from "@fluidframework/container-definitions";
import { IDocumentService } from "@fluidframework/driver-definitions";
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IConnectionManager, IConnectionManagerFactoryArgs } from "./contracts";
import { DeltaManager } from "./deltaManager";

const GroupedBatchOpType = "groupedBatch";

/**
 * Underneath, stores exactly the messages that are going to/from service.
 * Key point is that anyone who wants to observe the events or see the content of the DeltaQueue
 * will see the version that is virtualized (not what is sent over the wire).
 *
 * For example:
 * - Say we have ops 1, 2, 3 and they get grouped together in a new "groupedBatch" op
 * - Over the wire, we send just one op and the DeltaQueue will store just this single op
 * - When other places subscribe to "push"/"op" event or call "toArray"/"peek", they will see a version that
 * is inline with when the ops 1, 2, 3 were separate ops and will not see the "groupedBatch" op
 */
class VirtualDeltaQueueProxy<T> extends TypedEventEmitter<IDeltaQueueEvents<T>> implements IDeltaQueue<T> {
    private readonly _trackedListeners: Map<string, (...args: any[]) => void> = new Map();

    constructor(
        private readonly _queue: IDeltaQueue<T>,
        private readonly _virtualizeValue: (value: Readonly<T>) => T[],
        _observeValue: (value: Readonly<T>) => void,
    ) {
        super();

        this.on("newListener", (event, _listener) => {
            assert((this.listeners(event).length !== 0) === this._trackedListeners.has(event), "mismatch");
            if (!this._trackedListeners.has(event)) {
                let listener: (...args: any[]) => void;

                // eslint-disable-next-line unicorn/prefer-ternary
                if (event === "push" || event === "op") {
                    listener = (task: T) => {
                        // Let VirtualDeltaManager know it should update sequence number map (for inbound)
                        _observeValue(task);

                        // Emit event for each decomposed op as if that's how they were pushed to the DeltaQueue
                        this._virtualizeValue(task).forEach((it) => this.emit(event, it));
                    }
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
        if (value === undefined) {
            return undefined;
        }
        // Decompose potential "groupedBatch" and send the last message of that grouping
        const valueArr = this._virtualizeValue(value);
        return valueArr[valueArr.length - 1];
    }

    public toArray(): T[] {
        const virtualizedArr: T[] = [];
        this._queue.toArray().forEach((value) => {
            this._virtualizeValue(value).forEach((it) => virtualizedArr.push(it));
        })
        return virtualizedArr;
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

/**
 * This class works on top of DeltaManager to intercept the message flow at specific key stages
 * 1. Before we send messages to ConnectionManager (outbound). See "sendMessagesToConnectionManager"
 * 2. Before we send incoming op to other layers (inbound). See "processMessage"
 *
 * DeltaManager class will only work on the true identity of messages that are sent/received from service.
 * VirtualDeltaManager manages virtualizing those messages/sequence numbers for consumption in other layers.
 */
export class VirtualDeltaManager<TConnectionManager extends IConnectionManager>
    extends DeltaManager<TConnectionManager> {

    private _virtualSequenceNumber = 0;
    private _clientSequenceNumber = 0;

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
            this.ungroupAndVirtualizeSequencedMessage.bind(this),
            this.storeVirtualizedSequenceNumbers.bind(this),
        );

        this._virtualizedOutbound = new VirtualDeltaQueueProxy(
            this.connectionManager.outbound,
            (messages: Readonly<IDocumentMessage[]>) => {
                const virtualizedMessages: IDocumentMessage[] = [];
                for (const message of messages) {
                    this.ungroupAndVirtualizeDocumentMessage(message).forEach((it) => virtualizedMessages.push(it));
                }
                return [virtualizedMessages];
            },
            () => {}, // empty callback (nothing to be done on observing new value)
        );
    }

    public async attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        term: number,
        handler: IDeltaHandlerStrategy,
        prefetchType: "cached" | "all" | "none" = "none",
    ) {
        this._virtualSequenceNumber = sequenceNumber;

        // TODO: need to restore from previous state properly
        this._sequenceNumberMap.set(sequenceNumber, sequenceNumber);
        this._sequenceNumberMap.set(minSequenceNumber, minSequenceNumber);

        return super.attachOpHandler(minSequenceNumber, sequenceNumber, term, handler, prefetchType);
    }

    protected connectHandler(connection: IConnectionDetails) {
        // TODO: what else do we need to track here?
        this._clientSequenceNumber = 0;
        super.connectHandler(connection);
    }

    private _canIncrementClientSequenceNumber = true;
    protected prepareMessageToSend(message: Omit<IDocumentMessage, "clientSequenceNumber">): IDocumentMessage | undefined {
        const superMessage = super.prepareMessageToSend(message);
        if (superMessage === undefined) {
            return superMessage;
        }

        // Note: This ONLY works if all batches (multiple messages) are grouped to service
        if (this._canIncrementClientSequenceNumber) {
            this._clientSequenceNumber++;
            this._canIncrementClientSequenceNumber = false;
        }

        return {
            ...superMessage,
            clientSequenceNumber: this._clientSequenceNumber,
        }
    }

    protected sendMessageToConnectionManager(messages: Readonly<IDocumentMessage[]>): void {
        // TODO: remove this (for debugging)
        const newMessages = this.addNoOpToBatch(messages);

        this._canIncrementClientSequenceNumber = true;

        // If we are sending a batch (more than one message), group the messages together into a single op
        if (newMessages.length >= 2) {
            // Note: we don't need to store clientSequenceNumber in the map since this op will be forgotten
            // All the "subMessages" already have their virtual clientSequenceNumbers
            super.sendMessageToConnectionManager([{
                type: GroupedBatchOpType,
                clientSequenceNumber: newMessages[0].clientSequenceNumber,
                referenceSequenceNumber: newMessages[0].referenceSequenceNumber, // use oldest referenceSequenceNumber
                contents: newMessages,
            }]);
        } else {
            super.sendMessageToConnectionManager(newMessages);
        }
    }

    protected processMessage(message: Readonly<ISequencedDocumentMessage>, startTime: number): void {
        for (const subMessage of this.ungroupAndVirtualizeSequencedMessage(message)) {
            switch (subMessage.type) {
                case MessageType.SummaryAck:
                case MessageType.SummaryNack:
                    // Old files (prior to PR #10077) may not contain this info
                    // back-compat: ADO #1385: remove cast when ISequencedDocumentMessage changes are propagated
                    if ((subMessage as any).data !== undefined) {
                        subMessage.contents = JSON.parse((subMessage as any).data);
                    } else if (typeof subMessage.contents === "string") {
                        subMessage.contents = JSON.parse(subMessage.contents);
                    }
                    // eslint-disable-next-line no-case-declarations
                    const summarySequenceNumber = subMessage.contents.summaryProposal.summarySequenceNumber as number;
                    subMessage.contents.summaryProposal.summarySequenceNumber = this.virtualizeSequenceNumber(summarySequenceNumber);
                default:
                    super.processMessage(subMessage, startTime);
            }
        }
    }

    /**
     * Provided "real" sequence number (one sent over the wire), return its "virtual" counter-part for use by other consumers
     */
    public virtualizeSequenceNumber(sequenceNumber: number): number {
        if (sequenceNumber < 0) {
            return sequenceNumber;
        }
        const virtualizedSequenceNumber = this._sequenceNumberMap.get(sequenceNumber);
        assert(virtualizedSequenceNumber !== undefined, "sequenceNumber not found");

        return virtualizedSequenceNumber;
    }

    /**
     * Works on messages that are "inbound"
     * Will ungroup any "groupedBatch" SEQUENCED messages into their separate messages
     * Will virtualize all sequenceNumber properties as appropriate
     */
    private ungroupAndVirtualizeSequencedMessage(message: Readonly<ISequencedDocumentMessage>): ISequencedDocumentMessage[] {
        if (message.type === GroupedBatchOpType) {
            const messages = message.contents as IDocumentMessage[];
            let groupSequenceNumber = this.virtualizeSequenceNumber(message.sequenceNumber) - messages.length + 1;

            return messages.map((subMessage) => {
                return {
                    ...message, // This will override the property difference between ISequencedDocumentMessage and IDocumentMessage
                    ...subMessage,
                    sequenceNumber: groupSequenceNumber++,
                    referenceSequenceNumber: this.virtualizeSequenceNumber(subMessage.referenceSequenceNumber),
                    minimumSequenceNumber: this.virtualizeSequenceNumber(message.minimumSequenceNumber),
                }
            });
        } else {
            return [{
                ...message,
                sequenceNumber: this.virtualizeSequenceNumber(message.sequenceNumber),
                referenceSequenceNumber: this.virtualizeSequenceNumber(message.referenceSequenceNumber),
                minimumSequenceNumber: this.virtualizeSequenceNumber(message.minimumSequenceNumber),
            }];
        }
    }

    /**
     * Works on messages that are "outbound"
     * Will ungroup any "groupedBatch" messages into their separate messages
     * Will virtualize all sequenceNumber properties as appropriate
     */
    private ungroupAndVirtualizeDocumentMessage(message: Readonly<IDocumentMessage>): IDocumentMessage[] {
        if (message.type === GroupedBatchOpType) {
            const messages = message.contents as IDocumentMessage[];

            return messages.map((subMessage) => {
                return {
                    ...subMessage,
                    referenceSequenceNumber: this.virtualizeSequenceNumber(subMessage.referenceSequenceNumber),
                };
            });
        } else {
            return [{
                ...message,
                referenceSequenceNumber: this.virtualizeSequenceNumber(message.referenceSequenceNumber),
            }];
        }
    }

    /**
     * Based on the provided sequenced messag:
     * - update virtualSequenceNumber counter
     * - update the sequenceNumber map to store translation between "real" and "virtual" sequence numbers
     */
    private storeVirtualizedSequenceNumbers(message: Readonly<ISequencedDocumentMessage>): void {
        if (message.type === GroupedBatchOpType) {
            this._virtualSequenceNumber += (message.contents as IDocumentMessage[]).length;
            this._sequenceNumberMap.set(message.sequenceNumber, this._virtualSequenceNumber); // We store last sequenceNumber of group
        } else {
            this._sequenceNumberMap.set(message.sequenceNumber, ++this._virtualSequenceNumber);
        }
    }

    /**
     * Given virtual sequence number, return the corresponding real sequence number
     */
    public getRealSequenceNumber(virtualSequenceNumber: number): number {
        for (const [key, value] of this._sequenceNumberMap.entries()) {
            if (value === virtualSequenceNumber) {
                return key;
            }
        }
        assert(false, "virtual sequence number not found"); // TODO: https://github.com/microsoft/FluidFramework/pull/13963 if merged
    }

    // TODO: need to review how these numbers are being used in other layers
    // there is currently some mix and match happening

    public get initialSequenceNumber(): number {
        // TODO: review this number in attachOpHandler
        return this.virtualizeSequenceNumber(this.initSequenceNumber);
    }

    public get lastSequenceNumber(): number {
        return this.virtualizeSequenceNumber(this.lastProcessedSequenceNumber);
    }

    public get lastMessage() {
        if (this.lastProcessedMessage === undefined) {
            return undefined;
        }
        const messages = this.ungroupAndVirtualizeSequencedMessage(this.lastProcessedMessage);
        return messages[messages.length - 1];
    }

    public get lastKnownSeqNumber() {
        return this.virtualizeSequenceNumber(this.lastObservedSeqNumber);
    }

    public get minimumSequenceNumber(): number {
        return this.virtualizeSequenceNumber(this.minSequenceNumber);
    }

    /** TODO: remove this (for debugging) */
    private addNoOpToBatch(messages: Readonly<IDocumentMessage[]>): IDocumentMessage[] {
        const newMessages = [...messages];
        const messagePartial: Omit<IDocumentMessage, "clientSequenceNumber"> = {
            contents: undefined,
            metadata: undefined,
            referenceSequenceNumber: this.lastProcessedSequenceNumber,
            type: MessageType.NoOp,
            compression: undefined,
        };
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        newMessages.push(this.connectionManager.prepareMessageToSend(messagePartial)!);

        return newMessages;
    }
}

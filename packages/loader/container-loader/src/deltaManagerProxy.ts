/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDeltaManager,
    IDeltaManagerEvents,
    IDeltaQueue,
    IDeltaSender,
    IDeltaQueueEvents,
    ReadOnlyInfo,
} from "@fluidframework/container-definitions";
import { EventForwarder } from "@fluidframework/common-utils";
import {
    IClientConfiguration,
    IClientDetails,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";

/**
 * Proxy to the real IDeltaQueue - used to restrict access
 */
export class DeltaQueueProxy<T> extends EventForwarder<IDeltaQueueEvents<T>> implements IDeltaQueue<T> {
    public get paused(): boolean {
        return this.queue.paused;
    }

    public get length(): number {
        return this.queue.length;
    }

    public get idle(): boolean {
        return this.queue.idle;
    }

    constructor(private readonly queue: IDeltaQueue<T>) {
        super(queue);
    }

    public peek(): T | undefined {
        return this.queue.peek();
    }

    public toArray(): T[] {
        return this.queue.toArray();
    }

    // back-compat: usage removed in 0.33, remove in future versions
    public async systemPause(): Promise<void> {
        return this.pause();
    }

    public async pause(): Promise<void> {
        return this.queue.pause();
    }

    // back-compat: usage removed in 0.33, remove in future versions
    public async systemResume(): Promise<void> {
        return this.resume();
    }

    public async resume(): Promise<void> {
        this.queue.resume();
    }

    public async waitTillProcessingDone() {
        return this.queue.waitTillProcessingDone();
    }
}

/**
 * Proxy to the real IDeltaManager - used to restrict access
 */
export class DeltaManagerProxy
    extends EventForwarder<IDeltaManagerEvents>
    implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
    public readonly inbound: IDeltaQueue<ISequencedDocumentMessage>;
    public readonly outbound: IDeltaQueue<IDocumentMessage[]>;
    public readonly inboundSignal: IDeltaQueue<ISignalMessage>;

    public get IDeltaSender(): IDeltaSender {
        return this;
    }

    public get minimumSequenceNumber(): number {
        return this.deltaManager.minimumSequenceNumber;
    }

    public get lastSequenceNumber(): number {
        return this.deltaManager.lastSequenceNumber;
    }

    public get lastMessage() {
        return this.deltaManager.lastMessage;
    }

    public get lastKnownSeqNumber() {
        return this.deltaManager.lastKnownSeqNumber;
    }

    public get initialSequenceNumber(): number {
        return this.deltaManager.initialSequenceNumber;
    }

    public get hasCheckpointSequenceNumber() {
        return this.deltaManager.hasCheckpointSequenceNumber;
    }

    public get clientDetails(): IClientDetails {
        return this.deltaManager.clientDetails;
    }

    public get version(): string {
        return this.deltaManager.version;
    }

    public get maxMessageSize(): number {
        return this.deltaManager.maxMessageSize;
    }

    public get serviceConfiguration(): IClientConfiguration | undefined {
        return this.deltaManager.serviceConfiguration;
    }

    public get active(): boolean {
        return this.deltaManager.active;
    }

    public get readOnlyInfo(): ReadOnlyInfo {
        return this.deltaManager.readOnlyInfo;
    }

    constructor(private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>) {
        super(deltaManager);

        this.inbound = new DeltaQueueProxy(deltaManager.inbound);
        this.outbound = new DeltaQueueProxy(deltaManager.outbound);
        this.inboundSignal = new DeltaQueueProxy(deltaManager.inboundSignal);
    }

    public dispose(): void {
        this.inbound.dispose();
        this.outbound.dispose();
        this.inboundSignal.dispose();
        super.dispose();
    }

    public submitSignal(content: any): void {
        return this.deltaManager.submitSignal(content);
    }

    public flush(): void {
        return this.deltaManager.flush();
    }
}

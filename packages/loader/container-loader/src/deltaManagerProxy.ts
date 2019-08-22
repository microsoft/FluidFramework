/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionDetails,
    IDeltaHandlerStrategy,
    IDeltaManager,
    IDeltaQueue,
    IDeltaSender,
} from "@prague/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    MessageType,
} from "@prague/protocol-definitions";
import { EventEmitter } from "events";

function forward(event: string, from: EventEmitter, to: EventEmitter) {
    from.on(event, (...args: any[]) => to.emit(event, ...args));
}

/**
 * Proxy to the real IDeltaQueue - used to restrict access
 */
export class DeltaQueueProxy<T> extends EventEmitter implements IDeltaQueue<T> {
    public get paused(): boolean {
        return this.queue.paused;
    }

    public get length(): number {
        return this.queue.length;
    }

    public get idle(): boolean {
        return this.queue.idle;
    }

    private systemPaused = false;
    private localPaused = false;

    constructor(private readonly queue: IDeltaQueue<T>) {
        super();

        forward("error", this.queue, this);
        forward("op", this.queue, this);
        forward("push", this.queue, this);
        forward("pause", this.queue, this);
        forward("pre-op", this.queue, this);
        forward("resume", this.queue, this);
    }

    public peek(): T | undefined {
        return this.queue.peek();
    }

    public toArray(): T[] {
        return this.queue.toArray();
    }

    public systemPause(): Promise<void> {
        this.systemPaused = true;
        return this.queue.pause();
    }

    public pause(): Promise<void> {
        this.localPaused = true;
        return this.queue.pause();
    }

    public systemResume(): Promise<void> {
        this.systemPaused = false;
        return this.updateResume();
    }

    public resume(): Promise<void> {
        this.localPaused = false;
        return this.updateResume();
    }

    private updateResume(): Promise<void> {
        if (!this.systemPaused && !this.localPaused) {
            this.queue.resume();
        }

        return Promise.resolve();
    }
}

/**
 * Proxy to the real IDeltaManager - used to restrict access
 */
export class DeltaManagerProxy
    extends EventEmitter
    implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {

    public readonly inbound: IDeltaQueue<ISequencedDocumentMessage>;

    public readonly outbound: IDeltaQueue<IDocumentMessage[]>;

    public get IDeltaSender(): IDeltaSender {
        return this;
    }

    public get inboundSignal(): IDeltaQueue<ISignalMessage> {
        return this.deltaManager.inboundSignal;
    }

    public get minimumSequenceNumber(): number {
        return this.deltaManager.minimumSequenceNumber;
    }

    public get referenceSequenceNumber(): number {
        return this.deltaManager.referenceSequenceNumber;
    }

    public get clientType(): string {
        return this.deltaManager.clientType;
    }

    public get version(): string {
        return this.deltaManager.version;
    }

    public get maxMessageSize(): number {
        return this.deltaManager.maxMessageSize;
    }

    public get serviceConfiguration(): IServiceConfiguration {
        return this.deltaManager.serviceConfiguration;
    }

    constructor(private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>) {
        super();

        this.inbound = new DeltaQueueProxy(deltaManager.inbound);
        this.outbound = new DeltaQueueProxy(deltaManager.outbound);

        forward("allSentOpsAckd", this.deltaManager, this);
        forward("connect", this.deltaManager, this);
        forward("disconnect", this.deltaManager, this);
        forward("error", this.deltaManager, this);
        forward("pong", this.deltaManager, this);
        forward("prepareSend", this.deltaManager, this);
        forward("processTime", this.deltaManager, this);
        forward("submitOp", this.deltaManager, this);
    }

    public enableReadonlyMode(): void {
        return this.deltaManager.enableReadonlyMode();
    }

    public disableReadonlyMode(): void {
        return this.deltaManager.disableReadonlyMode();
    }

    public close(): void {
        return this.deltaManager.close();
    }

    public async connect(reason: string): Promise<IConnectionDetails> {
        return this.deltaManager.connect(reason);
    }

    public async getDeltas(
        reason: string,
        from: number,
        to?: number,
    ): Promise<ISequencedDocumentMessage[]> {
        return this.deltaManager.getDeltas(reason, from, to);
    }

    public attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        handler: IDeltaHandlerStrategy,
        resume: boolean,
    ) {
        return this.deltaManager.attachOpHandler(minSequenceNumber, sequenceNumber, handler, resume);
    }

    public submitSignal(content: any): void {
        return this.deltaManager.submitSignal(content);
    }

    public submit(type: MessageType, contents: any, batch: boolean, appData: any): number {
        return this.deltaManager.submit(type, contents, batch, appData);
    }

    public flush(): void {
        return this.deltaManager.flush();
    }
}

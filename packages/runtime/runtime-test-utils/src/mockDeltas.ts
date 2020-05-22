/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IClientDetails,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";

import {
    IDeltaManager,
    IDeltaQueue,
} from "@fluidframework/container-definitions";

/**
 * Mock implementation of IDeltaQueue for testing that does nothing
 */
class MockDeltaQueue<T> extends EventEmitter implements IDeltaQueue<T> {
    public get disposed() { return undefined; }

    public get paused(): boolean {
        return false;
    }

    public get length(): number {
        return 0;
    }

    public get idle(): boolean {
        return false;
    }

    public async pause(): Promise<void> {
        return;
    }

    public resume(): void {}

    public peek(): T | undefined {
        return undefined;
    }

    public toArray(): T[] {
        return [];
    }

    public async systemPause(): Promise<void> {
        return;
    }

    public systemResume(): void {
        return undefined;
    }

    public dispose() {}

    constructor() {
        super();
    }
}

/**
 * Mock implementation of IDeltaManager for testing that creates mock DeltaQueues for testing
 */
export class MockDeltaManager extends EventEmitter
    implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
    public get disposed() { return undefined; }

    public readonly readonly = false;
    public readonly clientType: string;
    public readonly clientDetails: IClientDetails;
    public get IDeltaSender() { return this; }

    private readonly _inbound: MockDeltaQueue<ISequencedDocumentMessage>;
    private readonly _inboundSignal: MockDeltaQueue<ISignalMessage>;
    private readonly _outbound: MockDeltaQueue<IDocumentMessage[]>;

    public get inbound(): IDeltaQueue<ISequencedDocumentMessage> {
        return this._inbound;
    }

    public get outbound(): IDeltaQueue<IDocumentMessage[]> {
        return this._outbound;
    }

    public get inboundSignal(): IDeltaQueue<ISignalMessage> {
        return this._inboundSignal;
    }

    public get minimumSequenceNumber(): number {
        return 0;
    }

    public get referenceSequenceNumber(): number {
        return 0;
    }

    public get initialSequenceNumber(): number {
        return 0;
    }

    public get version(): string {
        return undefined;
    }

    public get maxMessageSize(): number {
        return 0;
    }

    public get serviceConfiguration(): IServiceConfiguration {
        return undefined;
    }

    public get active(): boolean {
        return true;
    }

    public close(): void {}

    public submitSignal(content: any): void {}

    public flush() {}

    public submit(type: MessageType, contents: any, batch = false, metadata?: any): number {
        return 0;
    }

    public dispose() {}

    constructor() {
        super();

        this._inbound = new MockDeltaQueue<ISequencedDocumentMessage>();
        this._outbound = new MockDeltaQueue<IDocumentMessage[]>();
        this._inboundSignal = new MockDeltaQueue<ISignalMessage>();
    }
}

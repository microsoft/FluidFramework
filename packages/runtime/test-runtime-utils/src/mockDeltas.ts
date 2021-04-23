/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IClientConfiguration,
    IClientDetails,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";

import {
    IDeltaManager,
    IDeltaManagerEvents,
    IDeltaQueue,
    ReadOnlyInfo,
} from "@fluidframework/container-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

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

    public resume(): void { }

    public peek(): T | undefined {
        return undefined;
    }

    public toArray(): T[] {
        return [];
    }

    public dispose() { }

    public async waitTillProcessingDone() { }

    constructor() {
        super();
    }
}

/**
 * Mock implementation of IDeltaManager for testing that creates mock DeltaQueues for testing
 */
export class MockDeltaManager extends TypedEventEmitter<IDeltaManagerEvents>
    implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
    public get disposed() { return undefined; }

    public readonly readonly = false;
    public readOnlyInfo: ReadOnlyInfo = { readonly: false };
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
    public minimumSequenceNumber = 0;

    public lastSequenceNumber = 0;
    public lastMessage: ISequencedDocumentMessage | undefined;

    readonly lastKnownSeqNumber = 0;

    public initialSequenceNumber = 0;
    public hasCheckpointSequenceNumber = false;

    public get version(): string {
        return undefined;
    }

    public get maxMessageSize(): number {
        return 0;
    }

    public get serviceConfiguration(): IClientConfiguration {
        return undefined;
    }

    public get active(): boolean {
        return true;
    }

    public close(): void { }

    public submitSignal(content: any): void { }

    public flush() { }

    public submit(type: MessageType, contents: any, batch = false, localOpMetadata: any): number {
        return 0;
    }

    public dispose() { }

    constructor() {
        super();

        this._inbound = new MockDeltaQueue<ISequencedDocumentMessage>();
        this._outbound = new MockDeltaQueue<IDocumentMessage[]>();
        this._inboundSignal = new MockDeltaQueue<ISignalMessage>();
    }
}

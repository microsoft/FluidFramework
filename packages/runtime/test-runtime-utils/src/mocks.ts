/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    assert,
    stringToBuffer,
} from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidHandle,
    IFluidHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    ILoader,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";

import { DebugLogger } from "@fluidframework/telemetry-utils";
import {
    IQuorumClients,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISummaryTree,
    ITreeEntry,
    MessageType,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    IChannel,
    IFluidDataStoreRuntime,
    IDeltaConnection,
    IDeltaHandler,
    IChannelStorageService,
    IChannelServices,
} from "@fluidframework/datastore-definitions";
import { getNormalizedObjectStoragePathParts, mergeStats } from "@fluidframework/runtime-utils";
import {
    IFluidDataStoreChannel,
    IGarbageCollectionData,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import { v4 as uuid } from "uuid";
import { MockDeltaManager } from "./mockDeltas";

/**
 * Mock implementation of IDeltaConnection for testing
 */
export class MockDeltaConnection implements IDeltaConnection {
    public get connected(): boolean {
        return this._connected;
    }

    private _connected = true;
    public handler: IDeltaHandler | undefined;

    constructor(
        private readonly submitFn: (messageContent: any, localOpMetadata: unknown) => number,
        private readonly dirtyFn: () => void,
    ) { }

    public attach(handler: IDeltaHandler): void {
        this.handler = handler;
        handler.setConnectionState(this.connected);
    }

    public submit(messageContent: any, localOpMetadata: unknown): number {
        return this.submitFn(messageContent, localOpMetadata);
    }

    public dirty(): void {
        this.dirtyFn();
    }

    public setConnectionState(connected: boolean) {
        this._connected = connected;
        this.handler?.setConnectionState(connected);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        this.handler?.process(message, local, localOpMetadata);
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        this.handler?.reSubmit(content, localOpMetadata);
    }
}

// Represents the structure of a pending message stored by the MockContainerRuntime.
export interface IMockContainerRuntimePendingMessage {
    content: any;
    clientSequenceNumber: number;
    localOpMetadata: unknown;
}

/**
 * Mock implementation of ContainerRuntime for testing basic submitting and processing of messages.
 * If test specific logic is required, extend this class and add the logic there. For an example, take a look
 * at MockContainerRuntimeForReconnection.
 */
export class MockContainerRuntime {
    public clientId: string;
    protected clientSequenceNumber: number = 0;
    private readonly deltaManager: MockDeltaManager;
    protected readonly deltaConnections: MockDeltaConnection[] = [];
    protected readonly pendingMessages: IMockContainerRuntimePendingMessage[] = [];

    constructor(
        protected readonly dataStoreRuntime: MockFluidDataStoreRuntime,
        protected readonly factory: MockContainerRuntimeFactory,
    ) {
        this.deltaManager = new MockDeltaManager();
        // Set FluidDataStoreRuntime's deltaManager to ours so that they are in sync.
        this.dataStoreRuntime.deltaManager = this.deltaManager;
        this.dataStoreRuntime.quorum = factory.quorum;
        // FluidDataStoreRuntime already creates a clientId, reuse that so they are in sync.
        this.clientId = this.dataStoreRuntime.clientId ?? uuid();
        factory.quorum.addMember(this.clientId, {});
    }

    public createDeltaConnection(): MockDeltaConnection {
        const deltaConnection = new MockDeltaConnection(
            (messageContent: any, localOpMetadata: unknown) => this.submit(messageContent, localOpMetadata),
            () => this.dirty(),
        );
        this.deltaConnections.push(deltaConnection);
        return deltaConnection;
    }

    public submit(messageContent: any, localOpMetadata: unknown): number {
        const clientSequenceNumber = this.clientSequenceNumber++;
        const msg: Partial<ISequencedDocumentMessage> = {
            clientId: this.clientId,
            clientSequenceNumber,
            contents: messageContent,
            referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
            type: MessageType.Operation,

        };
        this.factory.pushMessage(msg);

        this.addPendingMessage(messageContent, localOpMetadata, clientSequenceNumber);

        return clientSequenceNumber;
    }

    public dirty(): void { }

    public process(message: ISequencedDocumentMessage) {
        this.deltaManager.lastSequenceNumber = message.sequenceNumber;
        this.deltaManager.lastMessage = message;
        this.deltaManager.minimumSequenceNumber = message.minimumSequenceNumber;
        const [local, localOpMetadata] = this.processInternal(message);
        this.deltaConnections.forEach((dc) => {
            dc.process(message, local, localOpMetadata);
        });
    }

    protected addPendingMessage(content: any, localOpMetadata: unknown, clientSequenceNumber: number) {
        const pendingMessage: IMockContainerRuntimePendingMessage = {
            content,
            clientSequenceNumber,
            localOpMetadata,
        };
        this.pendingMessages.push(pendingMessage);
    }

    private processInternal(message: ISequencedDocumentMessage): [boolean, unknown] {
        let localOpMetadata: unknown;
        const local = this.clientId === message.clientId;
        if (local) {
            const pendingMessage = this.pendingMessages.shift();
            assert(pendingMessage?.clientSequenceNumber === message.clientSequenceNumber,
                "Unexpected client sequence number from message");
            localOpMetadata = pendingMessage.localOpMetadata;
        }
        return [local, localOpMetadata];
    }
}

/**
 * Factory to create MockContainerRuntime for testing basic submitting and processing of messages.
 * This also acts as a very basic server that stores the messages from all the MockContainerRuntimes and
 * processes them when asked.
 * If test specific logic is required, extend this class and add the logic there. For an example, take a look
 * at MockContainerRuntimeFactoryForReconnection.
 */
export class MockContainerRuntimeFactory {
    public sequenceNumber = 0;
    public minSeq = new Map<string, number>();
    public readonly quorum = new MockQuorumClients();
    /**
     * The MockContainerRuntimes we produce will push messages into this queue as they are submitted.
     * This is playing the role of the orderer, establishing a single universal order for the messages generated.
     * They are held in this queue until we explicitly choose to process them, at which time they are "broadcast" to
     * each of the runtimes.
     */
    protected messages: ISequencedDocumentMessage[] = [];
    protected readonly runtimes: MockContainerRuntime[] = [];

    public get outstandingMessageCount() {
        return this.messages.length;
    }

    public getMinSeq(): number {
        let minSeq: number | undefined;
        for (const [, clientSeq] of this.minSeq) {
            if (!minSeq) {
                minSeq = clientSeq;
            } else {
                minSeq = Math.min(minSeq, clientSeq);
            }
        }
        return minSeq ?? 0;
    }

    public createContainerRuntime(dataStoreRuntime: MockFluidDataStoreRuntime): MockContainerRuntime {
        const containerRuntime =
            new MockContainerRuntime(dataStoreRuntime, this);
        this.runtimes.push(containerRuntime);
        return containerRuntime;
    }

    public pushMessage(msg: Partial<ISequencedDocumentMessage>) {
        if (msg.clientId && msg.referenceSequenceNumber !== undefined && !this.minSeq.has(msg.clientId)) {
            this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
        }
        this.messages.push(msg as ISequencedDocumentMessage);
    }

    /**
     * Process one of the queued messages.  Throws if no messages are queued.
     */
    public processOneMessage() {
        if (this.messages.length === 0) {
            throw new Error("Tried to process a message that did not exist");
        }

        let msg = this.messages.shift();

        // Explicitly JSON clone the value to match the behavior of going thru the wire.
        msg = JSON.parse(JSON.stringify(msg)) as ISequencedDocumentMessage;

        this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
        msg.sequenceNumber = ++this.sequenceNumber;
        msg.minimumSequenceNumber = this.getMinSeq();
        for (const runtime of this.runtimes) {
            runtime.process(msg);
        }
    }

    /**
     * Process a given number of queued messages.  Throws if there are fewer messages queued than requested.
     * @param count - the number of messages to process
     */
    public processSomeMessages(count: number) {
        if (count > this.messages.length) {
            throw new Error("Tried to process more messages than exist");
        }

        for (let i = 0; i < count; i++) {
            this.processOneMessage();
        }
    }

    /**
     * Process all remaining messages in the queue.
     */
    public processAllMessages() {
        while (this.messages.length > 0) {
            this.processOneMessage();
        }
    }
}

export class MockQuorumClients implements IQuorumClients, EventEmitter {
    private readonly members: Map<string, ISequencedClient>;
    private readonly eventEmitter = new EventEmitter();

    constructor(...members: [string, Partial<ISequencedClient>][]) {
        this.members = new Map(members as [string, ISequencedClient][] ?? []);
    }

    addMember(id: string, client: Partial<ISequencedClient>) {
        this.members.set(id, client as ISequencedClient);
        this.eventEmitter.emit("addMember", id, client);
    }

    removeMember(id: string) {
        if (this.members.delete(id)) {
            this.eventEmitter.emit("removeMember", id);
        }
    }

    getMembers(): Map<string, ISequencedClient> {
        return this.members;
    }
    getMember(clientId: string): ISequencedClient | undefined {
        return this.getMembers().get(clientId);
    }
    disposed: boolean = false;

    dispose(): void {
        throw new Error("Method not implemented.");
    }

    addListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        switch (event) {
            case "afterOn":
                this.eventEmitter.on(event, listener);
                return this;

            case "addMember":
            case "removeMember":
                this.eventEmitter.on(event, listener);
                this.eventEmitter.emit("afterOn", event);
                return this;
            default:
                throw new Error("Method not implemented.");
        }
    }
    once(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    prependListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
        this.eventEmitter.removeListener(event, listener);
        return this;
    }
    off(event: string | symbol, listener: (...args: any[]) => void): this {
        this.eventEmitter.off(event, listener);
        return this;
    }
    removeAllListeners(event?: string | symbol | undefined): this {
        throw new Error("Method not implemented.");
    }
    setMaxListeners(n: number): this {
        throw new Error("Method not implemented.");
    }
    getMaxListeners(): number {
        throw new Error("Method not implemented.");
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    listeners(event: string | symbol): Function[] {
        throw new Error("Method not implemented.");
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    rawListeners(event: string | symbol): Function[] {
        throw new Error("Method not implemented.");
    }
    emit(event: string | symbol, ...args: any[]): boolean {
        throw new Error("Method not implemented.");
    }
    eventNames(): (string | symbol)[] {
        throw new Error("Method not implemented.");
    }
    listenerCount(type: string | symbol): number {
        throw new Error("Method not implemented.");
    }
}

/**
 * Mock implementation of IRuntime for testing that does nothing
 */
export class MockFluidDataStoreRuntime extends EventEmitter
    implements IFluidDataStoreRuntime, IFluidDataStoreChannel, IFluidHandleContext {
    public get IFluidHandleContext(): IFluidHandleContext { return this; }
    public get rootRoutingContext(): IFluidHandleContext { return this; }
    public get channelsRoutingContext(): IFluidHandleContext { return this; }
    public get objectsRoutingContext(): IFluidHandleContext { return this; }

    public get IFluidRouter() { return this; }

    public readonly documentId: string = undefined as any;
    public readonly id: string = uuid();
    public readonly existing: boolean = undefined as any;
    public options: ILoaderOptions = {};
    public clientId: string | undefined = uuid();
    public readonly path = "";
    public readonly connected = true;
    public deltaManager = new MockDeltaManager();
    public readonly loader: ILoader = undefined as any;
    public readonly logger: ITelemetryLogger = DebugLogger.create("fluid:MockFluidDataStoreRuntime");
    public quorum = new MockQuorumClients();

    public get absolutePath() {
        return `/${this.id}`;
    }

    private _local = false;

    public get local(): boolean {
        return this._local;
    }

    public set local(local: boolean) {
        this._local = local;
    }

    private _disposed = false;

    public get disposed() { return this._disposed; }

    public dispose(): void {
        this._disposed = true;
    }

    public async getChannel(id: string): Promise<IChannel> {
        return null as any as IChannel;
    }
    public createChannel(id: string, type: string): IChannel {
        return null as any as IChannel;
    }

    public get isAttached(): boolean {
        return !this.local;
    }

    public get attachState(): AttachState {
        return this.local ? AttachState.Detached : AttachState.Attached;
    }

    public bindChannel(channel: IChannel): void {
        return;
    }

    public attachGraph(): void {
        return;
    }

    public bindToContext(): void {
        return;
    }

    public bind(handle: IFluidHandle): void {
        return;
    }

    public getQuorum(): IQuorumClients {
        return this.quorum;
    }

    public getAudience(): IAudience {
        return null as any as IAudience;
    }

    public save(message: string) {
        return;
    }

    public async close(): Promise<void> {
        return;
    }

    public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        return null as any as IFluidHandle<ArrayBufferLike>;
    }

    public async getBlob(blobId: string): Promise<any> {
        return null;
    }

    public submitMessage(type: MessageType, content: any) {
        return null;
    }

    public submitSignal(type: string, content: any) {
        return null;
    }

    public process(message: ISequencedDocumentMessage, local: boolean): void {
        return;
    }

    public processSignal(message: any, local: boolean) {
        return;
    }

    public updateMinSequenceNumber(value: number): void {
        return;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        return;
    }

    public async resolveHandle(request: IRequest): Promise<IResponse> {
        return this.request(request);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return null as any as IResponse;
    }

    public addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void {}

    public async summarize(fullTree?: boolean, trackState?: boolean): Promise<ISummaryTreeWithStats> {
        const stats = mergeStats();
        stats.treeNodeCount++;
        return {
            summary: {
                type: SummaryType.Tree,
                tree: {},
            },
            stats,
        };
    }

    public async getGCData(): Promise<IGarbageCollectionData> {
        return {
            gcNodes: {},
        };
    }

    public updateUsedRoutes(usedRoutes: string[], gcTimestamp?: number) {}

    public getAttachSnapshot(): ITreeEntry[] {
        return [];
    }

    public getAttachSummary(): ISummaryTreeWithStats {
        const stats = mergeStats();
        stats.treeNodeCount++;
        return {
            summary: {
                type: SummaryType.Tree,
                tree: {},
            },
            stats,
        };
    }

    public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
        return;
    }

    public async waitAttached(): Promise<void> {
        return;
    }

    public async requestDataStore(request: IRequest): Promise<IResponse> {
        return null as any as IResponse;
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        return;
    }

    public async applyStashedOp(content: any) {
        return;
    }
    public rollback?(message: any, localOpMetadata: unknown): void {
        return;
    }
}

/**
 * Mock implementation of IDeltaConnection
 */
export class MockEmptyDeltaConnection implements IDeltaConnection {
    public connected = false;

    public attach(handler) {
    }

    public submit(messageContent: any): number {
        assert(false, "Throw submit error on mock empty delta connection");
        return 0;
    }

    public dirty(): void { }
}

/**
 * Mock implementation of IChannelStorageService
 */
export class MockObjectStorageService implements IChannelStorageService {
    public constructor(private readonly contents: { [key: string]: string; }) {
    }

    public async readBlob(path: string): Promise<ArrayBufferLike> {
        return stringToBuffer(this.contents[path], "utf8");
    }

    public async contains(path: string): Promise<boolean> {
        return this.contents[path] !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        const pathPartsLength = getNormalizedObjectStoragePathParts(path).length;
        return Object.keys(this.contents)
            .filter((key) => key.startsWith(path)
                && key.split("/").length === pathPartsLength + 1);
    }
}

/**
 * Mock implementation of IChannelServices
 */
export class MockSharedObjectServices implements IChannelServices {
    public static createFromSummary(summaryTree: ISummaryTree) {
        const contents: { [key: string]: string; } = {};
        for (const [key, value] of Object.entries(summaryTree.tree)) {
            assert(value.type === SummaryType.Blob, "Unexpected summary type on mock createFromSummary");
            contents[key] = value.content as string;
        }
        return new MockSharedObjectServices(contents);
    }

    public deltaConnection: IDeltaConnection = new MockEmptyDeltaConnection();
    public objectStorage: MockObjectStorageService;

    public constructor(contents: { [key: string]: string; }) {
        this.objectStorage = new MockObjectStorageService(contents);
    }
}

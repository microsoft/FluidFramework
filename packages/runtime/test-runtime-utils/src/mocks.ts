/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import {
	FluidObject,
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
	FlushMode,
	IFluidDataStoreChannel,
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	VisibilityState,
} from "@fluidframework/runtime-definitions";
import { v4 as uuid } from "uuid";
import { MockDeltaManager } from "./mockDeltas";
import { MockHandle } from "./mockHandle";

/**
 * Mock implementation of IDeltaConnection for testing
 * @alpha
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
	) {}

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
/**
 * @alpha
 */
export interface IMockContainerRuntimePendingMessage {
	content: any;
	clientSequenceNumber: number;
	localOpMetadata: unknown;
}

/**
 * Options for the container runtime mock.
 * @alpha
 */
export interface IMockContainerRuntimeOptions {
	/**
	 * Configures the flush mode for the runtime. In Immediate flush mode the runtime will immediately
	 * send all operations to the driver layer, while in TurnBased the operations will be buffered
	 * and then sent them as a single batch when `flush()` is called on the runtime.
	 *
	 * By default, flush mode is Immediate.
	 */
	readonly flushMode?: FlushMode;
	/**
	 * If configured, it will simulate group batching by forcing all ops within a batch to have
	 * the same sequence number.
	 *
	 * By default, the value is `false`
	 */
	readonly enableGroupedBatching?: boolean;
}

const defaultMockContainerRuntimeOptions: Required<IMockContainerRuntimeOptions> = {
	flushMode: FlushMode.Immediate,
	enableGroupedBatching: false,
};

const makeContainerRuntimeOptions = (
	mockContainerRuntimeOptions: IMockContainerRuntimeOptions,
): Required<IMockContainerRuntimeOptions> => ({
	...defaultMockContainerRuntimeOptions,
	...mockContainerRuntimeOptions,
});

interface IInternalMockRuntimeMessage {
	content: any;
	localOpMetadata: unknown;
}

/**
 * Mock implementation of ContainerRuntime for testing basic submitting and processing of messages.
 * If test specific logic is required, extend this class and add the logic there. For an example, take a look
 * at MockContainerRuntimeForReconnection.
 * @alpha
 */
export class MockContainerRuntime {
	public clientId: string;
	protected clientSequenceNumber: number = 0;
	private readonly deltaManager: MockDeltaManager;
	/**
	 * @deprecated use the associated datastore to create the delta connection
	 */
	protected readonly deltaConnections: MockDeltaConnection[] = [];
	protected readonly pendingMessages: IMockContainerRuntimePendingMessage[] = [];
	private readonly outbox: IInternalMockRuntimeMessage[] = [];
	/**
	 * The runtime options this instance is using. See {@link IMockContainerRuntimeOptions}.
	 */
	protected runtimeOptions: Required<IMockContainerRuntimeOptions>;

	constructor(
		protected readonly dataStoreRuntime: MockFluidDataStoreRuntime,
		protected readonly factory: MockContainerRuntimeFactory,
		mockContainerRuntimeOptions: IMockContainerRuntimeOptions = defaultMockContainerRuntimeOptions,
		protected readonly overrides?: { minimumSequenceNumber?: number },
	) {
		this.deltaManager = new MockDeltaManager();
		const msn = overrides?.minimumSequenceNumber;
		if (msn !== undefined) {
			this.deltaManager.lastSequenceNumber = msn;
			this.deltaManager.minimumSequenceNumber = msn;
		}
		// Set FluidDataStoreRuntime's deltaManager to ours so that they are in sync.
		this.dataStoreRuntime.deltaManager = this.deltaManager;
		this.dataStoreRuntime.quorum = factory.quorum;
		this.dataStoreRuntime.containerRuntime = this;
		// FluidDataStoreRuntime already creates a clientId, reuse that so they are in sync.
		this.clientId = this.dataStoreRuntime.clientId ?? uuid();
		factory.quorum.addMember(this.clientId, {});
		this.runtimeOptions = makeContainerRuntimeOptions(mockContainerRuntimeOptions);
		assert(
			this.runtimeOptions.flushMode !== FlushMode.Immediate ||
				!this.runtimeOptions.enableGroupedBatching,
			"Grouped batching is not compatible with FlushMode.Immediate",
		);
	}

	/**
	 * @deprecated use the associated datastore to create the delta connection
	 */
	public createDeltaConnection(): MockDeltaConnection {
		const deltaConnection = this.dataStoreRuntime.createDeltaConnection();
		this.deltaConnections.push(deltaConnection);
		return deltaConnection;
	}

	public submit(messageContent: any, localOpMetadata: unknown): number {
		const clientSequenceNumber = this.clientSequenceNumber;
		const message = {
			content: messageContent,
			localOpMetadata,
		};

		this.clientSequenceNumber++;
		switch (this.runtimeOptions.flushMode) {
			case FlushMode.Immediate: {
				this.submitInternal(message, clientSequenceNumber);
				break;
			}

			case FlushMode.TurnBased: {
				this.outbox.push(message);
				break;
			}

			default:
				throw new Error(`Unsupported FlushMode ${this.runtimeOptions.flushMode}`);
		}

		return clientSequenceNumber;
	}

	public dirty(): void {}

	/**
	 * If flush mode is set to FlushMode.TurnBased, it will send all messages queued since the last time
	 * this method was called. Otherwise, calling the method does nothing.
	 */
	public flush() {
		if (this.runtimeOptions.flushMode !== FlushMode.TurnBased) {
			return;
		}

		let fakeClientSequenceNumber = 1;
		while (this.outbox.length > 0) {
			this.submitInternal(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.outbox.shift()!,
				// When grouped batching is used, the ops within the same grouped batch will have
				// fake sequence numbers when they're ungrouped. The submit function will still
				// return the clientSequenceNumber but this will ensure that the readers will always
				// read the fake client sequence numbers.
				this.runtimeOptions.enableGroupedBatching
					? fakeClientSequenceNumber++
					: this.clientSequenceNumber,
			);
		}
	}

	/**
	 * If flush mode is set to FlushMode.TurnBased, it will rebase the current batch by resubmitting them
	 * to the data stores. Otherwise, calling the method does nothing.
	 *
	 * The method requires `runtimeOptions.enableGroupedBatching` to be enabled.
	 */
	public rebase() {
		if (this.runtimeOptions.flushMode !== FlushMode.TurnBased) {
			return;
		}

		assert(
			this.runtimeOptions.enableGroupedBatching,
			"Rebasing is not supported when group batching is disabled",
		);

		const messagesToRebase = this.outbox.slice();
		this.outbox.length = 0;

		messagesToRebase.forEach((message) =>
			this.dataStoreRuntime.reSubmit(message.content, message.localOpMetadata),
		);
	}

	private submitInternal(message: IInternalMockRuntimeMessage, clientSequenceNumber: number) {
		this.factory.pushMessage({
			clientId: this.clientId,
			clientSequenceNumber,
			contents: message.content,
			referenceSequenceNumber: this.referenceSequenceNumber,
			type: MessageType.Operation,
		});
		this.addPendingMessage(message.content, message.localOpMetadata, clientSequenceNumber);
	}

	public process(message: ISequencedDocumentMessage) {
		this.deltaManager.lastSequenceNumber = message.sequenceNumber;
		this.deltaManager.lastMessage = message;
		this.deltaManager.minimumSequenceNumber = message.minimumSequenceNumber;
		const [local, localOpMetadata] = this.processInternal(message);
		this.dataStoreRuntime.process(message, local, localOpMetadata);
	}

	protected addPendingMessage(
		content: any,
		localOpMetadata: unknown,
		clientSequenceNumber: number,
	) {
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
			assert(
				pendingMessage?.clientSequenceNumber === message.clientSequenceNumber,
				"Unexpected message",
			);
			localOpMetadata = pendingMessage.localOpMetadata;
		}
		return [local, localOpMetadata];
	}

	/**
	 * The current reference sequence number observed by this runtime instance.
	 */
	protected get referenceSequenceNumber() {
		return this.deltaManager.lastSequenceNumber;
	}
}

/**
 * Factory to create MockContainerRuntime for testing basic submitting and processing of messages.
 * This also acts as a very basic server that stores the messages from all the MockContainerRuntimes and
 * processes them when asked.
 * If test specific logic is required, extend this class and add the logic there. For an example, take a look
 * at MockContainerRuntimeFactoryForReconnection.
 * @alpha
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

	/**
	 * The container runtime options which will be provided to the all runtimes
	 * created by this factory and also drive the way the ops are processed.
	 *
	 * See {@link IMockContainerRuntimeOptions}
	 */
	protected readonly runtimeOptions: Required<IMockContainerRuntimeOptions>;

	constructor(
		mockContainerRuntimeOptions: IMockContainerRuntimeOptions = defaultMockContainerRuntimeOptions,
	) {
		this.runtimeOptions = makeContainerRuntimeOptions(mockContainerRuntimeOptions);
	}

	public get outstandingMessageCount() {
		return this.messages.length;
	}

	/**
	 * @returns a minimum sequence number for all connected clients.
	 */
	public getMinSeq(): number {
		let minimumSequenceNumber: number | undefined;
		for (const [client, clientSequenceNumber] of this.minSeq) {
			// We have to make sure, a client is part of the quorum, when
			// we compute the msn. We assume that the quorum accurately
			// represents the currently connected clients. In some tests
			// for reconnects, we will remove clients from the quorum
			// to indicate they are currently not connected. In that case,
			// they must no longer contribute to the msn computation.
			if (this.quorum.getMember(client) !== undefined) {
				minimumSequenceNumber =
					minimumSequenceNumber === undefined
						? clientSequenceNumber
						: Math.min(minimumSequenceNumber, clientSequenceNumber);
			}
		}
		return minimumSequenceNumber ?? 0;
	}

	public createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
	): MockContainerRuntime {
		const containerRuntime = new MockContainerRuntime(
			dataStoreRuntime,
			this,
			this.runtimeOptions,
		);
		this.runtimes.push(containerRuntime);
		return containerRuntime;
	}

	public pushMessage(msg: Partial<ISequencedDocumentMessage>) {
		if (
			msg.clientId &&
			msg.referenceSequenceNumber !== undefined &&
			!this.minSeq.has(msg.clientId)
		) {
			this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
		}
		this.messages.push(msg as ISequencedDocumentMessage);
	}

	private lastProcessedMessage?: ISequencedDocumentMessage;
	private processFirstMessage() {
		assert(this.messages.length > 0, "The message queue should not be empty");

		// Explicitly JSON clone the value to match the behavior of going thru the wire.
		const message = JSON.parse(
			JSON.stringify(this.messages.shift()),
		) as ISequencedDocumentMessage;

		// TODO: Determine if this needs to be adapted for handling server-generated messages (which have null clientId and referenceSequenceNumber of -1).
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		this.minSeq.set(message.clientId as string, message.referenceSequenceNumber);
		if (
			this.runtimeOptions.flushMode === FlushMode.Immediate ||
			this.lastProcessedMessage?.clientId !== message.clientId
		) {
			this.sequenceNumber++;
		}
		message.sequenceNumber = this.sequenceNumber;
		message.minimumSequenceNumber = this.getMinSeq();
		this.lastProcessedMessage = message;
		for (const runtime of this.runtimes) {
			runtime.process(message);
		}
	}

	/**
	 * Process one of the queued messages.  Throws if no messages are queued.
	 */
	public processOneMessage() {
		if (this.messages.length === 0) {
			throw new Error("Tried to process a message that did not exist");
		}
		this.lastProcessedMessage = undefined;

		this.processFirstMessage();
	}

	/**
	 * Process a given number of queued messages.  Throws if there are fewer messages queued than requested.
	 * @param count - the number of messages to process
	 */
	public processSomeMessages(count: number) {
		if (count > this.messages.length) {
			throw new Error("Tried to process more messages than exist");
		}

		this.lastProcessedMessage = undefined;

		for (let i = 0; i < count; i++) {
			this.processFirstMessage();
		}
	}

	/**
	 * Process all remaining messages in the queue.
	 */
	public processAllMessages() {
		this.lastProcessedMessage = undefined;
		while (this.messages.length > 0) {
			this.processFirstMessage();
		}
	}
}

/**
 * @alpha
 */
export class MockQuorumClients implements IQuorumClients, EventEmitter {
	private readonly members: Map<string, ISequencedClient>;
	private readonly eventEmitter = new EventEmitter();

	constructor(...members: [string, Partial<ISequencedClient>][]) {
		this.members = new Map((members as [string, ISequencedClient][]) ?? []);
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
 * @alpha
 */
export class MockFluidDataStoreRuntime
	extends EventEmitter
	implements IFluidDataStoreRuntime, IFluidDataStoreChannel, IFluidHandleContext
{
	constructor(overrides?: {
		clientId?: string;
		entryPoint?: IFluidHandle<FluidObject>;
		id?: string;
		logger?: ITelemetryLoggerExt;
	}) {
		super();
		this.clientId = overrides?.clientId ?? uuid();
		this.entryPoint = overrides?.entryPoint ?? new MockHandle(null, "", "");
		this.id = overrides?.id ?? uuid();
		this.logger = createChildLogger({
			logger: overrides?.logger,
			namespace: "fluid:MockFluidDataStoreRuntime",
		});
	}

	public readonly entryPoint: IFluidHandle<FluidObject>;

	public get IFluidHandleContext(): IFluidHandleContext {
		return this;
	}
	public get rootRoutingContext(): IFluidHandleContext {
		return this;
	}
	public get channelsRoutingContext(): IFluidHandleContext {
		return this;
	}
	public get objectsRoutingContext(): IFluidHandleContext {
		return this;
	}

	public readonly documentId: string = undefined as any;
	public readonly id: string;
	public readonly existing: boolean = undefined as any;
	public options: ILoaderOptions = {};
	public clientId: string;
	public readonly path = "";
	public readonly connected = true;
	public deltaManager = new MockDeltaManager();
	public readonly loader: ILoader = undefined as any;
	public readonly logger: ITelemetryLoggerExt;
	public quorum = new MockQuorumClients();
	public containerRuntime?: MockContainerRuntime;
	private readonly deltaConnections: MockDeltaConnection[] = [];
	public createDeltaConnection(): MockDeltaConnection {
		const deltaConnection = new MockDeltaConnection(
			(messageContent: any, localOpMetadata: unknown) =>
				this.submitMessageInternal(messageContent, localOpMetadata),
			() => this.setChannelDirty(),
		);
		this.deltaConnections.push(deltaConnection);
		return deltaConnection;
	}

	public ensureNoDataModelChanges<T>(callback: () => T): T {
		return callback();
	}

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

	public get disposed() {
		return this._disposed;
	}

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

	public get visibilityState(): VisibilityState {
		return this.local ? VisibilityState.NotVisible : VisibilityState.GloballyVisible;
	}

	public bindChannel(channel: IChannel): void {
		return;
	}

	public attachGraph(): void {
		return;
	}

	public makeVisibleAndAttachGraph(): void {
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

	private submitMessageInternal(messageContent: any, localOpMetadata: unknown): number {
		assert(
			this.containerRuntime !== undefined,
			"The container runtime has not been initialized",
		);
		return this.containerRuntime.submit(messageContent, localOpMetadata);
	}

	private setChannelDirty(): void {
		assert(
			this.containerRuntime !== undefined,
			"The container runtime has not been initialized",
		);
		return this.containerRuntime.dirty();
	}

	public submitSignal(type: string, content: any) {
		return null;
	}

	public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
		this.deltaConnections.forEach((dc) => {
			dc.process(message, local, localOpMetadata);
		});
	}

	public processSignal(message: any, local: boolean) {
		return;
	}

	public updateMinSequenceNumber(value: number): void {
		return;
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		if (connected && clientId !== undefined) {
			this.clientId = clientId;
		}
		this.deltaConnections.forEach((dc) => dc.setConnectionState(connected));
		return;
	}

	public async resolveHandle(request: IRequest): Promise<IResponse> {
		return this.request(request);
	}

	public async request(request: IRequest): Promise<IResponse> {
		return null as any as IResponse;
	}

	public addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void {}

	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
	): Promise<ISummaryTreeWithStats> {
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

	public updateUsedRoutes(usedRoutes: string[]) {}

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
		this.deltaConnections.forEach((dc) => {
			dc.reSubmit(content, localOpMetadata);
		});
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
 * @internal
 */
export class MockEmptyDeltaConnection implements IDeltaConnection {
	public connected = false;

	public attach(handler) {}

	public submit(messageContent: any): number {
		assert(false, "Throw submit error on mock empty delta connection");
		return 0;
	}

	public dirty(): void {}
}

/**
 * Mock implementation of IChannelStorageService
 * @alpha
 */
export class MockObjectStorageService implements IChannelStorageService {
	public constructor(private readonly contents: { [key: string]: string }) {}

	public async readBlob(path: string): Promise<ArrayBufferLike> {
		return stringToBuffer(this.contents[path], "utf8");
	}

	public async contains(path: string): Promise<boolean> {
		return this.contents[path] !== undefined;
	}

	public async list(path: string): Promise<string[]> {
		const pathPartsLength = getNormalizedObjectStoragePathParts(path).length;
		return Object.keys(this.contents).filter(
			(key) => key.startsWith(path) && key.split("/").length === pathPartsLength + 1,
		);
	}
}

/**
 * Mock implementation of IChannelServices
 * @alpha
 */
export class MockSharedObjectServices implements IChannelServices {
	public static createFromSummary(summaryTree: ISummaryTree) {
		const contents: { [key: string]: string } = {};
		setContentsFromSummaryTree(summaryTree, "", contents);
		return new MockSharedObjectServices(contents);
	}

	public deltaConnection: IDeltaConnection = new MockEmptyDeltaConnection();
	public objectStorage: MockObjectStorageService;

	public constructor(contents: { [key: string]: string }) {
		this.objectStorage = new MockObjectStorageService(contents);
	}
}

/**
 * Populate the given `contents` object with all paths/values in a summary tree
 */
function setContentsFromSummaryTree(
	{ tree }: ISummaryTree,
	path: string,
	contents: { [key: string]: string },
): void {
	for (const [key, value] of Object.entries(tree)) {
		switch (value.type) {
			case SummaryType.Blob:
				assert(
					typeof value.content === "string",
					"Unexpected blob value on mock createFromSummary",
				);
				contents[`${path}${key}`] = value.content;
				break;
			case SummaryType.Tree:
				setContentsFromSummaryTree(value, `${path}${key}/`, contents);
				break;
			default:
				assert(false, "Unexpected summary type on mock createFromSummary");
		}
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter, TypedEventEmitter, stringToBuffer } from "@fluid-internal/client-utils";
import {
	AttachState,
	IAudience,
	IAudienceEvents,
	ISelf,
} from "@fluidframework/container-definitions";
import { ILoader, IAudienceOwner } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions/internal";
import {
	FluidObject,
	IFluidHandle,
	IRequest,
	IResponse,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import {
	IFluidHandleContext,
	type IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelServices,
	IChannelStorageService,
	IDeltaConnection,
	IDeltaHandler,
	IChannel,
	IFluidDataStoreRuntime,
	IChannelFactory,
	type IDeltaManagerErased,
} from "@fluidframework/datastore-definitions/internal";
import type { IClient } from "@fluidframework/driver-definitions";
import {
	IQuorumClients,
	ISequencedClient,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/driver-definitions";
import {
	ITreeEntry,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	IIdCompressorCore,
	IdCreationRange,
} from "@fluidframework/id-compressor/internal";
import {
	ISummaryTreeWithStats,
	IGarbageCollectionData,
	FlushMode,
	IFluidDataStoreChannel,
	VisibilityState,
	type ITelemetryContext,
	type IRuntimeMessageCollection,
	type IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";
import {
	getNormalizedObjectStoragePathParts,
	mergeStats,
	toDeltaManagerErased,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { deepFreeze } from "./deepFreeze.js";
import { MockDeltaManager } from "./mockDeltas.js";
import { MockHandle } from "./mockHandle.js";

/**
 * Mock implementation of IDeltaConnection for testing
 * @legacy
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

	/**
	 * @deprecated - This has been replaced by processMessages
	 */
	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		this.handler?.process(message, local, localOpMetadata);
	}

	public processMessages(messageCollection: IRuntimeMessageCollection) {
		this.handler?.processMessages?.(messageCollection);
	}

	public reSubmit(content: any, localOpMetadata: unknown) {
		this.handler?.reSubmit(content, localOpMetadata);
	}

	public applyStashedOp(content: any): unknown {
		return this.handler?.applyStashedOp(content);
	}
}

// Represents the structure of a pending message stored by the MockContainerRuntime.
/**
 * @legacy
 * @alpha
 */
export interface IMockContainerRuntimePendingMessage {
	content: any;
	referenceSequenceNumber: number;
	clientSequenceNumber: number;
	localOpMetadata: unknown;
}

type IMockContainerRuntimeSequencedIdAllocationMessage = ISequencedDocumentMessage & {
	contents: IMockContainerRuntimeIdAllocationMessage;
};

export interface IMockContainerRuntimeIdAllocationMessage {
	type: "idAllocation";
	contents: IdCreationRange;
}

/**
 * Options for the container runtime mock.
 * @legacy
 * @alpha
 */
export type IMockContainerRuntimeOptions =
	| {
			/**
			 * In Immediate flush mode, the runtime will immediately flush all messages and they will be ready
			 * to process.
			 */
			readonly flushMode: FlushMode.Immediate;
	  }
	| {
			/**
			 * In TurnBased flush mode the runtime will buffer all messages. These will be flushed based on the
			 * "flushAutomatically" flag described below.
			 */
			readonly flushMode: FlushMode.TurnBased;
			/**
			 * If set to true, messages for a client will be queued and flushed automatically when another client
			 * sends a message. The last set of messages will be flushed when one of the process methods is called
			 * on the runtime factory.
			 * This option tries to preserve the order in which messages are sent. However, there may be
			 * scenarios where a test wants to control exactly when to flush messages and that's when this flag
			 * should be set to false.
			 *
			 * If set to false, the runtime will only flush when the flush() method is called.
			 *
			 * The default value is false.
			 */
			readonly flushAutomatically?: boolean;
			/**
			 * If configured, it will simulate group batching by forcing all ops within a batch to have fake client
			 * sequence numbers and, the same sequence number and minimum sequence number.
			 *
			 * The default value is true.
			 */
			readonly enableGroupedBatching?: boolean;
	  };

const defaultMockContainerRuntimeOptions: Required<IMockContainerRuntimeOptions> = {
	flushMode: FlushMode.Immediate,
};

const makeContainerRuntimeOptions = (
	mockContainerRuntimeOptions: IMockContainerRuntimeOptions,
): Required<IMockContainerRuntimeOptions> => {
	const options = {
		...defaultMockContainerRuntimeOptions,
		...mockContainerRuntimeOptions,
	};

	if (options.flushMode === FlushMode.TurnBased) {
		options.enableGroupedBatching = options.enableGroupedBatching ?? true;
		options.flushAutomatically = options.flushAutomatically ?? false;
	}

	return options as Required<IMockContainerRuntimeOptions>;
};

/**
 * @legacy
 * @alpha
 */
export interface IInternalMockRuntimeMessage {
	content: any;
	clientSequenceNumber: number;
	localOpMetadata?: unknown;
}

/**
 * Returns whether the two messages are from the same batch for the purposes of grouped batching.
 * Messages in the same batch will have the same clientId and reference sequence number.
 */
function areMessagesFromSameBatch(
	message1: ISequencedDocumentMessage | undefined,
	message2: ISequencedDocumentMessage,
	flushMode: FlushMode,
) {
	return (
		flushMode === FlushMode.TurnBased &&
		message1?.clientId === message2.clientId &&
		message1?.referenceSequenceNumber === message2.referenceSequenceNumber
	);
}

/**
 * Mock implementation of IContainerRuntime for testing basic submitting and processing of messages.
 * If test specific logic is required, extend this class and add the logic there. For an example, take a look
 * at MockContainerRuntimeForReconnection.
 * @legacy
 * @alpha
 */
export class MockContainerRuntime extends TypedEventEmitter<IContainerRuntimeEvents> {
	public clientId: string;
	public readonly deltaManager: MockDeltaManager;
	/**
	 * @deprecated use the associated datastore to create the delta connection
	 */
	protected readonly deltaConnections: MockDeltaConnection[] = [];
	protected readonly pendingMessages: IMockContainerRuntimePendingMessage[] = [];
	protected readonly outbox: IInternalMockRuntimeMessage[] = [];
	private readonly idAllocationOutbox: IInternalMockRuntimeMessage[] = [];
	/**
	 * The runtime options this instance is using. See {@link IMockContainerRuntimeOptions}.
	 */
	private readonly runtimeOptions: Required<IMockContainerRuntimeOptions>;

	constructor(
		protected readonly dataStoreRuntime: MockFluidDataStoreRuntime,
		protected readonly factory: MockContainerRuntimeFactory,
		mockContainerRuntimeOptions: IMockContainerRuntimeOptions = defaultMockContainerRuntimeOptions,
		protected readonly overrides?: { minimumSequenceNumber?: number | undefined },
	) {
		super();
		this.deltaManager = new MockDeltaManager(() => this.clientId);
		this.deltaManager.inbound.on("push", (message: ISequencedDocumentMessage) => {
			this.factory.pushMessage(message);
		});

		const msn = overrides?.minimumSequenceNumber;
		if (msn !== undefined) {
			this.deltaManager.lastSequenceNumber = msn;
			this.deltaManager.minimumSequenceNumber = msn;
		}
		// Set FluidDataStoreRuntime's deltaManager to ours so that they are in sync.
		this.dataStoreRuntime.deltaManagerInternal = this.deltaManager;
		this.dataStoreRuntime.quorum = factory.quorum;
		this.dataStoreRuntime.containerRuntime = this;
		// FluidDataStoreRuntime already creates a clientId, reuse that so they are in sync.
		this.clientId = this.dataStoreRuntime.clientId ?? uuid();
		factory.quorum.addMember(this.clientId, {});
		this.runtimeOptions = makeContainerRuntimeOptions(mockContainerRuntimeOptions);
	}

	/**
	 * @deprecated use the associated datastore to create the delta connection
	 */
	public createDeltaConnection(): MockDeltaConnection {
		const deltaConnection = this.dataStoreRuntime.createDeltaConnection();
		this.deltaConnections.push(deltaConnection);
		return deltaConnection;
	}

	public finalizeIdRange(range: IdCreationRange) {
		assert(
			this.dataStoreRuntime.idCompressor !== undefined,
			"Shouldn't try to finalize IdRanges without an IdCompressor",
		);
		this.dataStoreRuntime.idCompressor.finalizeCreationRange(range);
	}

	public submit(messageContent: any, localOpMetadata?: unknown): number {
		const clientSequenceNumber = ++this.deltaManager.clientSequenceNumber;
		const message: IInternalMockRuntimeMessage = {
			content: messageContent,
			localOpMetadata,
			clientSequenceNumber,
		};

		const isAllocationMessage = this.isAllocationMessage(message.content);

		switch (this.runtimeOptions.flushMode) {
			case FlushMode.Immediate: {
				if (!isAllocationMessage) {
					const idAllocationOp = this.generateIdAllocationOp(clientSequenceNumber);
					if (idAllocationOp !== undefined) {
						this.submitInternal(idAllocationOp);
					}
				}
				this.submitInternal(message);
				break;
			}

			case FlushMode.TurnBased: {
				// Id allocation messages are directly submitted during the resubmit path
				if (isAllocationMessage) {
					this.idAllocationOutbox.push(message);
				} else {
					this.outbox.push(message);
				}
				this.factory.queueFlush(this.clientId, () => this.flush());
				break;
			}

			default:
		}

		return clientSequenceNumber;
	}

	private isSequencedAllocationMessage(
		message: ISequencedDocumentMessage,
	): message is IMockContainerRuntimeSequencedIdAllocationMessage {
		return this.isAllocationMessage(message.contents);
	}

	private isAllocationMessage(
		message: any,
	): message is IMockContainerRuntimeIdAllocationMessage {
		return (
			message !== undefined &&
			(message as IMockContainerRuntimeIdAllocationMessage).type === "idAllocation"
		);
	}

	public dirty(): void {}
	public get isDirty() {
		return this.pendingMessages.length > 0;
	}

	/**
	 * If flush mode is set to FlushMode.TurnBased, it will send all messages queued since the last time
	 * this method was called. Otherwise, calling the method does nothing.
	 */
	public flush() {
		if (this.runtimeOptions.flushMode !== FlushMode.TurnBased) {
			return;
		}

		const enableGroupedBatching = this.runtimeOptions.enableGroupedBatching;

		let fakeClientSequenceNumber = 0;
		const idAllocationOpClientSeq = this.runtimeOptions.enableGroupedBatching
			? ++fakeClientSequenceNumber
			: ++this.deltaManager.clientSequenceNumber;

		// This mimics the runtime behavior of the IdCompressor by generating an IdAllocationOp
		// and sticking it in front of any op that might rely on that id. It differs slightly in that
		// in the actual runtime it would get put in its own separate batch
		const idAllocationOp = this.generateIdAllocationOp(idAllocationOpClientSeq);
		if (idAllocationOp !== undefined) {
			this.idAllocationOutbox.push(idAllocationOp);
		}

		// As with the runtime behavior, we need to send the idAllocationOps first
		const messagesToSubmit = this.idAllocationOutbox.concat(this.outbox);
		this.idAllocationOutbox.length = 0;
		this.outbox.length = 0;

		messagesToSubmit.forEach((message) => {
			// When grouped batching is used, the ops within the same grouped batch will have
			// fake sequence numbers when they're ungrouped. The submit function will still
			// return the clientSequenceNumber but this will ensure that the readers will always
			// read the fake client sequence numbers.
			const clientSequenceNumber = enableGroupedBatching
				? ++fakeClientSequenceNumber
				: message.clientSequenceNumber;
			this.submitInternal({ ...message, clientSequenceNumber });
		});
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

		// Only outbox needs to be rebased. The idAllocationOutbox is not rebased, as that
		// is a no-op (though resubmitting the other ops may generate new IDs)
		const messagesToRebase = this.outbox.slice();
		this.outbox.length = 0;

		this.reSubmitMessages(messagesToRebase);
	}

	protected reSubmitMessages(
		messagesToResubmit: { content: any; localOpMetadata?: unknown }[],
	): void {
		// Sort the messages so that idAllocation messages are submitted first
		// When resubmitting non-idAllocation messages, they may generate new IDs.
		// This sort ensures that all ID ranges are finalized before they are
		// needed (i.e. before the messages that rely on them are processed)
		// and in the order they were allocated
		const orderedMessages = messagesToResubmit
			.filter((message) => message.content.type === "idAllocation")
			.concat(messagesToResubmit.filter((message) => message.content.type !== "idAllocation"));
		orderedMessages.forEach((pendingMessage) => {
			if (pendingMessage.content.type === "idAllocation") {
				this.submit(pendingMessage.content, pendingMessage.localOpMetadata);
			} else {
				this.dataStoreRuntime.reSubmit(pendingMessage.content, pendingMessage.localOpMetadata);
			}
		});
	}

	private generateIdAllocationOp(
		clientSequenceNumber: number,
	): IInternalMockRuntimeMessage | undefined {
		const idRange = this.dataStoreRuntime.idCompressor?.takeNextCreationRange();
		if (idRange?.ids !== undefined) {
			const allocationOp: IMockContainerRuntimeIdAllocationMessage = {
				type: "idAllocation",
				contents: idRange,
			};
			return {
				content: allocationOp,
				clientSequenceNumber,
			};
		}
		return undefined;
	}

	private submitInternal(message: IInternalMockRuntimeMessage) {
		// Here, we should instead push to the DeltaManager. And the DeltaManager will push things into the factory's messages
		this.deltaManager.outbound.push([
			{
				clientSequenceNumber: message.clientSequenceNumber,
				contents: message.content,
				referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
				type: MessageType.Operation,
			},
		]);
		this.addPendingMessage(
			message.content,
			message.localOpMetadata,
			message.clientSequenceNumber,
		);
	}

	/**
	 * deprecated - use processMessages instead
	 */
	public process(message: ISequencedDocumentMessage) {
		this.processMessages([message]);
	}

	/**
	 * Processes multiple messages. It mimics the op bunching feature of the runtime by processing ops
	 * from same clients in a bunch.
	 */
	public processMessages(messages: ISequencedDocumentMessage[]) {
		if (messages.length === 0) {
			return;
		}

		let bunchedMessagesContent: IRuntimeMessagesContent[] = [];
		let previousMessage: ISequencedDocumentMessage | undefined;
		let previousLocal: boolean | undefined;

		const sendBunchedMessages = (): void => {
			if (previousMessage === undefined) {
				return;
			}
			assert(previousLocal !== undefined, "previous local must exist");
			const messageCollection: IRuntimeMessageCollection = {
				envelope: previousMessage,
				local: previousLocal,
				messagesContent: bunchedMessagesContent,
			};
			this.dataStoreRuntime.processMessages(messageCollection);
			bunchedMessagesContent = [];
		};

		for (const message of messages) {
			this.deltaManager.process(message);
			const [local, localOpMetadata] = this.processInternal(message);

			// Id allocation messages are for the runtime, so process it here directly.
			if (this.isSequencedAllocationMessage(message)) {
				sendBunchedMessages();
				this.finalizeIdRange(message.contents.contents);
				previousMessage = undefined;
				previousLocal = undefined;
				bunchedMessagesContent = [];
				continue;
			}

			// If the message is from a different batch, send the previous bunch of messages to the
			// data store for processing.
			if (!areMessagesFromSameBatch(previousMessage, message, this.runtimeOptions.flushMode)) {
				sendBunchedMessages();
			}

			previousLocal = local;
			previousMessage = message;

			bunchedMessagesContent.push({
				contents: message.contents,
				localOpMetadata,
				clientSequenceNumber: message.clientSequenceNumber,
			});
		}

		sendBunchedMessages();
	}

	protected addPendingMessage(
		content: any,
		localOpMetadata: unknown,
		clientSequenceNumber: number,
	) {
		const pendingMessage: IMockContainerRuntimePendingMessage = {
			referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
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

	public async resolveHandle(handle: IFluidHandle) {
		return this.dataStoreRuntime.resolveHandle({
			url: toFluidHandleInternal(handle).absolutePath,
		});
	}
}

/**
 * Factory to create MockContainerRuntime for testing basic submitting and processing of messages.
 * This also acts as a very basic server that stores the messages from all the MockContainerRuntimes and
 * processes them when asked.
 * If test specific logic is required, extend this class and add the logic there. For an example, take a look
 * at MockContainerRuntimeFactoryForReconnection.
 * @legacy
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
	protected readonly runtimes: Set<MockContainerRuntime> = new Set();

	/**
	 * In TurnBased flush mode, keeps track of the last pending flush operation from a particular client.
	 */
	private pendingFlush: { clientId: string; flush: () => void } | undefined;
	/**
	 * In TurnBased flush mode and if flushAutomatically is true, queues of the last pending flush operation
	 * from a particular client. If the clientId changes from the pending flush, it will flush the pending flush.
	 */
	public queueFlush(clientId: string, flush: () => void) {
		assert(
			this.runtimeOptions.flushMode === FlushMode.TurnBased,
			"queueFlush can only be called in TurnBased flush mode",
		);
		if (
			this.runtimeOptions.flushAutomatically === false ||
			this.pendingFlush?.clientId === clientId
		) {
			return;
		}
		this.pendingFlush?.flush();
		this.pendingFlush = { clientId, flush };
	}

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
		this.runtimes.add(containerRuntime);
		return containerRuntime;
	}

	public removeContainerRuntime(containerRuntime: MockContainerRuntime) {
		this.runtimes.delete(containerRuntime);
	}

	public pushMessage(msg: Partial<ISequencedDocumentMessage>) {
		deepFreeze(msg);
		if (
			msg.clientId &&
			msg.referenceSequenceNumber !== undefined &&
			!this.minSeq.has(msg.clientId)
		) {
			this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
		}
		this.messages.push(msg as ISequencedDocumentMessage);
	}

	private lastProcessedMessage: ISequencedDocumentMessage | undefined;

	/**
	 * Returns the first message in the queue to process. It assigns sequence number and minimum sequence number
	 * to the message.
	 */
	private getFirstMessageToProcess() {
		// Explicitly JSON clone the value to match the behavior of going thru the wire.
		const message = JSON.parse(
			JSON.stringify(this.messages.shift()),
		) as ISequencedDocumentMessage;

		// TODO: Determine if this needs to be adapted for handling server-generated messages (which have null clientId and referenceSequenceNumber of -1).
		this.minSeq.set(message.clientId as string, message.referenceSequenceNumber);

		// In TurnBased flush mode, if grouped batching is enabled, we will assign the same sequence number to messages
		// from the same batch.
		// eslint-disable-next-line unicorn/prefer-ternary
		if (
			this.runtimeOptions.flushMode === FlushMode.TurnBased &&
			this.runtimeOptions.enableGroupedBatching &&
			areMessagesFromSameBatch(
				this.lastProcessedMessage,
				message,
				this.runtimeOptions.flushMode,
			)
		) {
			message.sequenceNumber = this.sequenceNumber;
		} else {
			message.sequenceNumber = ++this.sequenceNumber;
		}
		message.minimumSequenceNumber = this.getMinSeq();
		this.lastProcessedMessage = message;
		return message;
	}

	private processMessages(messages: ISequencedDocumentMessage[]) {
		for (const runtime of this.runtimes) {
			runtime.processMessages(messages);
		}
	}

	/**
	 * Process a given number of queued messages.
	 * In Immediate flush mode, it processes the messages one by one.
	 * In TurnBased flush mode, it flushes any pending messages. It then sends the given number of
	 * messages to all the runtimes.
	 * @param count - the number of messages to process
	 */
	public processSomeMessages(count: number) {
		if (count === 0) {
			return;
		}

		if (count > this.messages.length) {
			throw new Error("Tried to process more messages than exist");
		}

		if (this.runtimeOptions.flushMode === FlushMode.TurnBased) {
			this.pendingFlush?.flush();
			const messages: ISequencedDocumentMessage[] = [];
			for (let i = 0; i < count; i++) {
				messages.push(this.getFirstMessageToProcess());
			}
			this.processMessages(messages);
		} else {
			for (let i = 0; i < count; i++) {
				const message = this.getFirstMessageToProcess();
				this.processMessages([message]);
			}
		}
	}

	/**
	 * Process one of the queued messages.
	 */
	public processOneMessage() {
		this.processSomeMessages(1);
	}

	/**
	 * Process all messages in the queue.
	 * In Immediate flush mode, it processes all the messages one by one.
	 * In TurnBased flush mode, it flushes any pending messages. It then sends all the messages to all the runtimes.
	 *
	 * Note that this will also process messages that were added to the queue after the call to this method.
	 */
	public processAllMessages() {
		if (this.runtimeOptions.flushMode === FlushMode.TurnBased) {
			this.pendingFlush?.flush();
			const messages: ISequencedDocumentMessage[] = [];
			while (this.messages.length > 0) {
				messages.push(this.getFirstMessageToProcess());
			}
			this.processMessages(messages);
		} else {
			while (this.messages.length > 0) {
				const message = this.getFirstMessageToProcess();
				this.processMessages([message]);
			}
		}
	}
}

/**
 * @legacy
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

	addListener(event: string | number, listener: (...args: any[]) => void): this {
		throw new Error("Method not implemented.");
	}
	on(event: string | number, listener: (...args: any[]) => void): this {
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
	once(event: string | number, listener: (...args: any[]) => void): this {
		throw new Error("Method not implemented.");
	}
	prependListener(event: string | number, listener: (...args: any[]) => void): this {
		throw new Error("Method not implemented.");
	}
	prependOnceListener(event: string | number, listener: (...args: any[]) => void): this {
		throw new Error("Method not implemented.");
	}
	removeListener(event: string | number, listener: (...args: any[]) => void): this {
		this.eventEmitter.removeListener(event, listener);
		return this;
	}
	off(event: string | number, listener: (...args: any[]) => void): this {
		this.eventEmitter.off(event, listener);
		return this;
	}
	removeAllListeners(event?: string | number | undefined): this {
		throw new Error("Method not implemented.");
	}
	setMaxListeners(n: number): this {
		throw new Error("Method not implemented.");
	}
	getMaxListeners(): number {
		throw new Error("Method not implemented.");
	}
	listeners(event: string | number): ReturnType<EventEmitter["listeners"]> {
		throw new Error("Method not implemented.");
	}
	rawListeners(event: string | number): ReturnType<EventEmitter["rawListeners"]> {
		throw new Error("Method not implemented.");
	}
	emit(event: string | number, ...args: any[]): boolean {
		throw new Error("Method not implemented.");
	}
	eventNames(): (string | number)[] {
		throw new Error("Method not implemented.");
	}
	listenerCount(type: string | number): number {
		throw new Error("Method not implemented.");
	}
}

/**
 * @legacy
 * @alpha
 */
export class MockAudience
	extends TypedEventEmitter<IAudienceEvents>
	implements IAudienceOwner
{
	private readonly audienceMembers: Map<string, IClient>;
	private _currentClientId: string | undefined;

	public constructor() {
		super();
		this.audienceMembers = new Map<string, IClient>();
	}

	public addMember(clientId: string, member: IClient): void {
		this.audienceMembers.set(clientId, member);
		this.emit("addMember", clientId, member);
	}

	public removeMember(clientId: string): boolean {
		const member = this.audienceMembers.get(clientId);
		const deleteResult = this.audienceMembers.delete(clientId);
		this.emit("removeMember", clientId, member);
		return deleteResult;
	}

	public getMembers(): Map<string, IClient> {
		return new Map<string, IClient>(this.audienceMembers.entries());
	}
	public getMember(clientId: string): IClient | undefined {
		return this.audienceMembers.get(clientId);
	}

	public getSelf(): ISelf | undefined {
		return this._currentClientId === undefined
			? undefined
			: {
					clientId: this._currentClientId,
				};
	}

	public setCurrentClientId(clientId: string): void {
		if (this._currentClientId !== clientId) {
			const oldId = this._currentClientId;
			this._currentClientId = clientId;
			this.emit(
				"selfChanged",
				oldId === undefined ? undefined : ({ clientId: oldId } satisfies ISelf),
				{ clientId } satisfies ISelf,
			);
		}
	}
}

const attachStatesToComparableNumbers = {
	[AttachState.Detached]: 0,
	[AttachState.Attaching]: 1,
	[AttachState.Attached]: 2,
} as const;

/**
 * Mock implementation of IRuntime for testing that does nothing
 * @legacy
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
		logger?: ITelemetryBaseLogger;
		idCompressor?: IIdCompressor & IIdCompressorCore;
		attachState?: AttachState;
		registry?: readonly IChannelFactory[];
	}) {
		super();
		this.clientId = overrides?.clientId ?? uuid();
		this.entryPoint = toFluidHandleInternal(
			overrides?.entryPoint ?? new MockHandle(null as unknown as FluidObject, "", ""),
		);
		this.id = overrides?.id ?? uuid();
		const childLoggerProps: Parameters<typeof createChildLogger>[0] = {
			namespace: "fluid:MockFluidDataStoreRuntime",
		};
		const logger = overrides?.logger;
		if (logger !== undefined) {
			childLoggerProps.logger = logger;
		}
		this.logger = createChildLogger(childLoggerProps);
		this.idCompressor = overrides?.idCompressor;
		this._attachState = overrides?.attachState ?? AttachState.Attached;

		const registry = overrides?.registry;
		if (registry) {
			this.registry = new Map(registry.map((factory) => [factory.type, factory]));
		}
	}

	public readonly entryPoint: IFluidHandleInternal<FluidObject>;

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
	public options: Record<string | number, any> = {};
	public clientId: string;
	public readonly path = "";
	public readonly connected = true;
	public deltaManagerInternal = new MockDeltaManager();
	public get deltaManager(): IDeltaManagerErased {
		return toDeltaManagerErased(this.deltaManagerInternal);
	}
	public readonly loader: ILoader = undefined as any;
	public readonly logger: ITelemetryBaseLogger;
	public quorum = new MockQuorumClients();
	private readonly audience = new MockAudience();
	public containerRuntime?: MockContainerRuntime;
	public idCompressor: (IIdCompressor & IIdCompressorCore) | undefined;
	private readonly deltaConnections: MockDeltaConnection[] = [];
	private readonly registry?: ReadonlyMap<string, IChannelFactory>;

	public createDeltaConnection(): MockDeltaConnection {
		const deltaConnection = new MockDeltaConnection(
			(messageContent: any, localOpMetadata: unknown) =>
				this.submitMessageInternal(messageContent, localOpMetadata),
			() => this.setChannelDirty(),
		);
		this.deltaConnections.push(deltaConnection);
		return deltaConnection;
	}

	public get absolutePath() {
		return `/${this.id}`;
	}

	/**
	 * @deprecated Use `attachState` instead
	 *
	 * @privateRemarks Also remove the setter when this is removed. setters don't get their own doc tags.
	 */
	public get local(): boolean {
		return !this.isAttached;
	}
	public set local(local: boolean) {
		// this does not validate attach state orders, or fire events to maintain
		// the existing behavior. due to this, this method is deprecated and will
		// be removed
		this._attachState = local ? AttachState.Detached : AttachState.Attached;
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
	public createChannel(id: string | undefined, type: string): IChannel {
		if (this.registry === undefined) {
			// This preserves the behavior of this mock from before registry support was added.
			return null as any as IChannel;
		}

		const factory = this.registry.get(type);
		assert(factory !== undefined, "type missing from registry");
		return factory.create(this, id ?? uuid());
	}

	public addChannel(channel: IChannel): void {}

	public get isAttached(): boolean {
		return this.attachState !== AttachState.Detached;
	}

	private _attachState: AttachState;
	public get attachState(): AttachState {
		return this._attachState;
	}

	public get visibilityState(): VisibilityState {
		return this.isAttached ? VisibilityState.GloballyVisible : VisibilityState.NotVisible;
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
		return this.audience;
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

	/**
	 * @deprecated - This has been replaced by processMessages
	 */
	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		this.deltaConnections.forEach((dc) => {
			dc.process(message, local, localOpMetadata);
		});
	}

	public processMessages(messageCollection: IRuntimeMessageCollection) {
		this.deltaConnections.forEach((dc) => {
			if (dc.processMessages !== undefined) {
				dc.processMessages(messageCollection);
			} else {
				for (const {
					contents,
					localOpMetadata,
					clientSequenceNumber,
				} of messageCollection.messagesContent) {
					dc.process(
						{ ...messageCollection.envelope, contents, clientSequenceNumber },
						messageCollection.local,
						localOpMetadata,
					);
				}
			}
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
		if (request.url !== undefined) {
			return {
				status: 200,
				mimeType: "fluid/object",
				value: request.url,
			};
		}
		return this.request(request);
	}

	public async request(request: IRequest): Promise<IResponse> {
		return null as any as IResponse;
	}

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

	public getAttachGCData(
		telemetryContext?: ITelemetryContext | undefined,
	): IGarbageCollectionData {
		return {
			gcNodes: {},
		};
	}

	public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
		if (attachState === this._attachState) {
			return;
		}
		const proposedState = attachStatesToComparableNumbers[attachState];
		const startingState = attachStatesToComparableNumbers[this._attachState];
		if (proposedState < startingState) {
			throw new Error(`cannot transition back to ${attachState} from ${this.attachState}`);
		}

		if (
			startingState < attachStatesToComparableNumbers[AttachState.Attaching] &&
			proposedState >= attachStatesToComparableNumbers[AttachState.Attaching]
		) {
			this._attachState = AttachState.Attaching;
			this.emit("attaching");
		}

		if (
			startingState < attachStatesToComparableNumbers[AttachState.Attached] &&
			proposedState >= attachStatesToComparableNumbers[AttachState.Attached]
		) {
			this._attachState = AttachState.Attached;
			this.emit("attached");
		}
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
		return this.deltaConnections.map((dc) => dc.applyStashedOp(content))[0];
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
	}

	public dirty(): void {}
}

/**
 * Mock implementation of IChannelStorageService
 * @legacy
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
 * @legacy
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

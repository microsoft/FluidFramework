/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { AttachState, IAudience } from "@fluidframework/container-definitions";
import { IDeltaManager } from "@fluidframework/container-definitions/internal";
import {
	FluidObject,
	IFluidHandle,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import {
	assert,
	Deferred,
	LazyPromise,
	unreachableCase,
} from "@fluidframework/core-utils/internal";
import {
	IChannel,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeEvents,
	type IDeltaManagerErased,
} from "@fluidframework/datastore-definitions/internal";
import {
	IClientDetails,
	IQuorumClients,
	ISummaryBlob,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/driver-definitions";
import {
	IDocumentMessage,
	type ISnapshotTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { buildSnapshotTree } from "@fluidframework/driver-utils/internal";
import { IIdCompressor } from "@fluidframework/id-compressor";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	IGarbageCollectionData,
	CreateChildSummarizerNodeParam,
	CreateSummarizerNodeSource,
	IAttachMessage,
	IEnvelope,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	VisibilityState,
	gcDataBlobKey,
	IInboundSignalMessage,
	type IRuntimeMessageCollection,
	type IRuntimeMessagesContent,
	// eslint-disable-next-line import/no-deprecated
	type IContainerRuntimeBaseExperimental,
} from "@fluidframework/runtime-definitions/internal";
import {
	GCDataBuilder,
	RequestParser,
	SummaryTreeBuilder,
	addBlobToSummary,
	convertSnapshotTreeToSummaryTree,
	convertSummaryTreeToITree,
	create404Response,
	createResponseError,
	exceptionToResponse,
	generateHandleContextPath,
	processAttachMessageGCData,
	toFluidHandleInternal,
	unpackChildNodesUsedRoutes,
	toDeltaManagerErased,
	encodeCompactIdToString,
} from "@fluidframework/runtime-utils/internal";
import {
	ITelemetryLoggerExt,
	DataProcessingError,
	LoggingError,
	MonitoringContext,
	UsageError,
	createChildMonitoringContext,
	generateStack,
	raiseConnectedEvent,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { IChannelContext, summarizeChannel } from "./channelContext.js";
import { FluidObjectHandle } from "./fluidHandle.js";
import {
	LocalChannelContext,
	LocalChannelContextBase,
	RehydratedLocalChannelContext,
} from "./localChannelContext.js";
import { pkgVersion } from "./packageVersion.js";
import { RemoteChannelContext } from "./remoteChannelContext.js";

/**
 * @legacy
 * @alpha
 */
export enum DataStoreMessageType {
	// Creates a new channel
	Attach = "attach",
	ChannelOp = "op",
}

/**
 * @legacy
 * @alpha
 */
export interface ISharedObjectRegistry {
	// TODO consider making this async. A consequence is that either the creation of a distributed data type
	// is async or we need a new API to split the synchronous vs. asynchronous creation.
	get(name: string): IChannelFactory | undefined;
}

/**
 * Base data store class
 * @legacy
 * @alpha
 */
export class FluidDataStoreRuntime
	extends TypedEventEmitter<IFluidDataStoreRuntimeEvents>
	// eslint-disable-next-line import/no-deprecated
	implements IFluidDataStoreChannel, IFluidDataStoreRuntime, IFluidHandleContext
{
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IFluidDataStoreRuntime.entryPoint}
	 */
	public readonly entryPoint: IFluidHandleInternal<FluidObject>;

	public get connected(): boolean {
		return this.dataStoreContext.connected;
	}

	public get clientId(): string | undefined {
		return this.dataStoreContext.clientId;
	}

	public get clientDetails(): IClientDetails {
		return this.dataStoreContext.clientDetails;
	}

	public get isAttached(): boolean {
		return this.attachState !== AttachState.Detached;
	}

	public get attachState(): AttachState {
		return this._attachState;
	}

	public get absolutePath(): string {
		return generateHandleContextPath(this.id, this.routeContext);
	}

	public get routeContext(): IFluidHandleContext {
		return this.dataStoreContext.IFluidHandleContext;
	}

	public get idCompressor(): IIdCompressor | undefined {
		return this.dataStoreContext.idCompressor;
	}

	public get IFluidHandleContext() {
		return this;
	}

	public get rootRoutingContext() {
		return this;
	}
	public get channelsRoutingContext() {
		return this;
	}
	public get objectsRoutingContext() {
		return this;
	}

	private _disposed = false;
	public get disposed() {
		return this._disposed;
	}

	private readonly contexts = new Map<string, IChannelContext>();
	private readonly pendingAttach = new Set<string>();

	private readonly deferredAttached = new Deferred<void>();
	private readonly localChannelContextQueue = new Map<string, LocalChannelContextBase>();
	private readonly notBoundedChannelContextSet = new Set<string>();
	private _attachState: AttachState;
	public visibilityState: VisibilityState;
	// A list of handles that are bound when the data store is not visible. We have to make them visible when the data
	// store becomes visible.
	private readonly pendingHandlesToMakeVisible: Set<IFluidHandleInternal> = new Set();

	public readonly id: string;

	public readonly options: Record<string | number, any>;
	public readonly deltaManagerInternal: IDeltaManager<
		ISequencedDocumentMessage,
		IDocumentMessage
	>;
	private readonly quorum: IQuorumClients;
	private readonly audience: IAudience;
	private readonly mc: MonitoringContext;
	public get logger(): ITelemetryLoggerExt {
		return this.mc.logger;
	}

	/**
	 * If the summarizer makes local changes, a telemetry event is logged. This has the potential to be very noisy.
	 * So, adding a count of how many telemetry events are logged per data store context. This can be
	 * controlled via feature flags.
	 */
	private localChangesTelemetryCount: number;

	/**
	 * Create an instance of a DataStore runtime.
	 *
	 * @param dataStoreContext - Context object for the runtime.
	 * @param sharedObjectRegistry - The registry of shared objects that this data store will be able to instantiate.
	 * @param existing - Pass 'true' if loading this datastore from an existing file; pass 'false' otherwise.
	 * @param provideEntryPoint - Function to initialize the entryPoint object for the data store runtime. The
	 * handle to this data store runtime will point to the object returned by this function. If this function is not
	 * provided, the handle will be left undefined. This is here so we can start making handles a first-class citizen
	 * and the primary way of interacting with some Fluid objects, and should be used if possible.
	 */
	public constructor(
		private readonly dataStoreContext: IFluidDataStoreContext,
		private readonly sharedObjectRegistry: ISharedObjectRegistry,
		existing: boolean,
		provideEntryPoint: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		super();

		assert(
			!dataStoreContext.id.includes("/"),
			0x30e /* Id cannot contain slashes. DataStoreContext should have validated this. */,
		);

		this.mc = createChildMonitoringContext({
			logger: dataStoreContext.baseLogger,
			namespace: "FluidDataStoreRuntime",
			properties: {
				all: { dataStoreId: uuid(), dataStoreVersion: pkgVersion },
			},
		});

		this.id = dataStoreContext.id;
		this.options = dataStoreContext.options;
		this.deltaManagerInternal = dataStoreContext.deltaManager;
		this.quorum = dataStoreContext.getQuorum();
		this.audience = dataStoreContext.getAudience();

		const tree = dataStoreContext.baseSnapshot;

		// Must always receive the data store type inside of the attributes
		if (tree?.trees !== undefined) {
			Object.entries(tree.trees).forEach(([path, subtree]) => {
				// Issue #4414
				if (path === "_search") {
					return;
				}

				let channelContext: RemoteChannelContext | RehydratedLocalChannelContext;
				// If already exists on storage, then create a remote channel. However, if it is case of rehydrating a
				// container from snapshot where we load detached container from a snapshot, isLocalDataStore would be
				// true. In this case create a RehydratedLocalChannelContext.
				if (dataStoreContext.isLocalDataStore) {
					channelContext = this.createRehydratedLocalChannelContext(path, subtree);
					// This is the case of rehydrating a detached container from snapshot. Now due to delay loading of
					// data store, if the data store is loaded after the container is attached, then we missed making
					// the channel visible. So do it now. Otherwise, add it to local channel context queue, so
					// that it can be make it visible later with the data store.
					if (dataStoreContext.attachState !== AttachState.Detached) {
						channelContext.makeVisible();
					} else {
						this.localChannelContextQueue.set(path, channelContext);
					}
				} else {
					channelContext = new RemoteChannelContext(
						this,
						dataStoreContext,
						dataStoreContext.storage,
						(content, localOpMetadata) => this.submitChannelOp(path, content, localOpMetadata),
						(address: string) => this.setChannelDirty(address),
						path,
						subtree,
						this.sharedObjectRegistry,
						undefined /* extraBlobs */,
						this.dataStoreContext.getCreateChildSummarizerNodeFn(path, {
							type: CreateSummarizerNodeSource.FromSummary,
						}),
					);
				}

				this.contexts.set(path, channelContext);
			});
		}

		this.entryPoint = new FluidObjectHandle<FluidObject>(
			new LazyPromise(async () => provideEntryPoint(this)),
			"",
			this.objectsRoutingContext,
		);

		this.attachListener();
		this._attachState = dataStoreContext.attachState;

		/**
		 * If existing flag is false, this is a new data store and is not visible. The existing flag can be true in two
		 * conditions:
		 *
		 * 1. It's a local data store that is created when a detached container is rehydrated. In this case, the data
		 * store is locally visible because the snapshot it is loaded from contains locally visible data stores only.
		 *
		 * 2. It's a remote data store that is created when an attached container is loaded is loaded from snapshot or
		 * when an attach op comes in. In both these cases, the data store is already globally visible.
		 */
		if (existing) {
			this.visibilityState =
				dataStoreContext.attachState === AttachState.Detached
					? VisibilityState.LocallyVisible
					: VisibilityState.GloballyVisible;
		} else {
			this.visibilityState = VisibilityState.NotVisible;
		}

		// If it's existing we know it has been attached.
		if (existing) {
			this.deferredAttached.resolve();
		}

		// By default, a data store can log maximum 10 local changes telemetry in summarizer.
		this.localChangesTelemetryCount =
			this.mc.config.getNumber("Fluid.Telemetry.LocalChangesTelemetryCount") ?? 10;

		// eslint-disable-next-line import/no-deprecated
		const base: IContainerRuntimeBaseExperimental | undefined =
			// eslint-disable-next-line import/no-deprecated
			this.dataStoreContext.containerRuntime satisfies IContainerRuntimeBaseExperimental;
		if (base !== undefined && "inStagingMode" in base) {
			Object.defineProperty(this, "inStagingMode", {
				get: () => {
					return base.inStagingMode;
				},
			});
		}
	}

	get deltaManager(): IDeltaManagerErased {
		return toDeltaManagerErased(this.deltaManagerInternal);
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		this.emit("dispose");
		this.removeAllListeners();
	}

	public async resolveHandle(request: IRequest): Promise<IResponse> {
		return this.request(request);
	}

	public async request(request: IRequest): Promise<IResponse> {
		try {
			const parser = RequestParser.create(request);
			// If there are not path parts, and the request is via a handle
			// then we should return the entrypoint object for this runtime.
			// This allows the entrypoint handle to be resolved without the need
			// for the entrypoint object to know anything about requests or handles.
			//
			// This works because the entrypoint handle is an object handle,
			// which always has a real reference to the object itself.
			// Those get serialized and then deserialized into a plain handle, which really just has a path,
			// resolution walks to the runtime, which calls this, and get the true object off the internal object handle
			if (parser.pathParts.length === 0 && request.headers?.viaHandle === true) {
				return { mimeType: "fluid/object", status: 200, value: await this.entryPoint.get() };
			}
			const id = parser.pathParts[0];

			if (id === "_channels" || id === "_custom") {
				return await this.request(parser.createSubRequest(1));
			}

			if (id !== undefined) {
				// Check for a data type reference first
				const context = this.contexts.get(id);
				if (context !== undefined && parser.isLeaf(1)) {
					try {
						const channel = await context.getChannel();

						return { mimeType: "fluid/object", status: 200, value: channel };
					} catch (error) {
						this.mc.logger.sendErrorEvent({ eventName: "GetChannelFailedInRequest" }, error);

						return createResponseError(500, `Failed to get Channel: ${error}`, request);
					}
				}
			}

			// Otherwise defer to an attached request handler
			return create404Response(request);
		} catch (error) {
			return exceptionToResponse(error);
		}
	}

	public async getChannel(id: string): Promise<IChannel> {
		this.verifyNotClosed();

		const context = this.contexts.get(id);
		if (context === undefined) {
			throw new LoggingError("Channel does not exist");
		}

		return context.getChannel();
	}

	/**
	 * Validate user provided channel ID
	 * Channel ID has limitations. "/" is not allowed as IDs in storage can not have slashes - we parse tree paths and use "/" as separator.
	 * IDs cannot start with "_" as it could result in collision of IDs with auto-assigned (by FF) short IDs.
	 * @param id - channel ID.
	 */
	protected validateChannelId(id: string) {
		if (id.includes("/")) {
			throw new UsageError(`Id cannot contain slashes: ${id}`);
		}
		if (id.startsWith("_")) {
			throw new UsageError(`Id cannot start with underscore: ${id}`);
		}
	}

	/**
	 * Api which allows caller to create the channel first and then add it to the runtime.
	 * The channel type should be present in the registry, otherwise the runtime would reject
	 * the channel. Also the runtime used to create the channel object should be same to which
	 * it is added.
	 * @param channel - channel which needs to be added to the runtime.
	 */
	public addChannel(channel: IChannel): void {
		const id = channel.id;
		this.validateChannelId(id);

		this.verifyNotClosed();

		assert(!this.contexts.has(id), 0x865 /* addChannel() with existing ID */);

		const type = channel.attributes.type;
		const factory = this.sharedObjectRegistry.get(channel.attributes.type);
		if (factory === undefined) {
			throw new Error(`Channel Factory ${type} not registered`);
		}

		this.createChannelContext(channel);
		// Channels (DDS) should not be created in summarizer client.
		this.identifyLocalChangeInSummarizer("DDSCreatedInSummarizer", id, type);
	}

	public createChannel(idArg: string | undefined, type: string): IChannel {
		let id: string;

		if (idArg !== undefined) {
			id = idArg;
			this.validateChannelId(id);
		} else {
			/**
			 * There is currently a bug where certain data store ids such as "[" are getting converted to ASCII characters
			 * in the snapshot.
			 * So, return short ids only if explicitly enabled via feature flags. Else, return uuid();
			 */
			if (this.mc.config.getBoolean("Fluid.Runtime.UseShortIds") === true) {
				// We use three non-overlapping namespaces:
				// - detached state: even numbers
				// - attached state: odd numbers
				// - uuids
				// In first two cases we will encode result as strings in more compact form, with leading underscore,
				// to ensure no overlap with user-provided DDS names (see validateChannelId())
				if (this.visibilityState !== VisibilityState.GloballyVisible) {
					// container is detached, only one client observes content, no way to hit collisions with other clients.
					id = encodeCompactIdToString(2 * this.contexts.size, "_");
				} else {
					// Due to back-compat, we could not depend yet on generateDocumentUniqueId() being there.
					// We can remove the need to leverage uuid() as fall-back in couple releases.
					const res =
						this.dataStoreContext.containerRuntime.generateDocumentUniqueId?.() ?? uuid();
					id = typeof res === "number" ? encodeCompactIdToString(2 * res + 1, "_") : res;
				}
			} else {
				id = uuid();
			}
			assert(!id.includes("/"), 0x8fc /* slash */);
		}

		this.verifyNotClosed();
		assert(!this.contexts.has(id), 0x179 /* "createChannel() with existing ID" */);

		assert(type !== undefined, 0x209 /* "Factory Type should be defined" */);
		const factory = this.sharedObjectRegistry.get(type);
		if (factory === undefined) {
			throw new Error(`Channel Factory ${type} not registered`);
		}

		const channel = factory.create(this, id);
		this.createChannelContext(channel);
		// Channels (DDS) should not be created in summarizer client.
		this.identifyLocalChangeInSummarizer("DDSCreatedInSummarizer", id, type);
		return channel;
	}

	private createChannelContext(channel: IChannel) {
		this.notBoundedChannelContextSet.add(channel.id);
		const context = new LocalChannelContext(
			channel,
			this,
			this.dataStoreContext,
			this.dataStoreContext.storage,
			this.logger,
			(content, localOpMetadata) => this.submitChannelOp(channel.id, content, localOpMetadata),
			(address: string) => this.setChannelDirty(address),
		);
		this.contexts.set(channel.id, context);
	}

	private createRehydratedLocalChannelContext(
		id: string,
		tree: ISnapshotTree,
		flatBlobs?: Map<string, ArrayBufferLike>,
	) {
		return new RehydratedLocalChannelContext(
			id,
			this.sharedObjectRegistry,
			this,
			this.dataStoreContext,
			this.dataStoreContext.storage,
			this.logger,
			(content, localOpMetadata) => this.submitChannelOp(id, content, localOpMetadata),
			(address: string) => this.setChannelDirty(address),
			tree,
			flatBlobs,
		);
	}

	/**
	 * Binds a channel with the runtime. If the runtime is attached we will attach the channel right away.
	 * If the runtime is not attached we will defer the attach until the runtime attaches.
	 * @param channel - channel to be registered.
	 */
	public bindChannel(channel: IChannel): void {
		assert(
			this.notBoundedChannelContextSet.has(channel.id),
			0x17b /* "Channel to be bound should be in not bounded set" */,
		);
		this.notBoundedChannelContextSet.delete(channel.id);
		// If our data store is attached, then attach the channel.
		if (this.isAttached) {
			this.makeChannelLocallyVisible(channel);
			return;
		}

		/**
		 * If this channel is already waiting to be made visible, do nothing. This can happen during attachGraph() when
		 * a channel's graph is attached. It calls bindToContext on the shared object which will end up back here.
		 */
		if (this.pendingHandlesToMakeVisible.has(toFluidHandleInternal(channel.handle))) {
			return;
		}

		this.bind(channel.handle);

		// If our data store is local then add the channel to the queue
		if (!this.localChannelContextQueue.has(channel.id)) {
			this.localChannelContextQueue.set(
				channel.id,
				this.contexts.get(channel.id) as LocalChannelContextBase,
			);
		}
	}

	/**
	 * This function is called when a data store becomes root. It does the following:
	 *
	 * 1. Marks the data store locally visible in the container.
	 *
	 * 2. Attaches the graph of all the handles bound to it.
	 *
	 * 3. Calls into the data store context to mark it visible in the container too. If the container is globally
	 * visible, it will mark us globally visible. Otherwise, it will mark us globally visible when it becomes
	 * globally visible.
	 */
	public makeVisibleAndAttachGraph() {
		if (this.visibilityState !== VisibilityState.NotVisible) {
			return;
		}
		this.visibilityState = VisibilityState.LocallyVisible;

		this.pendingHandlesToMakeVisible.forEach((handle) => {
			handle.attachGraph();
		});
		this.pendingHandlesToMakeVisible.clear();
		this.dataStoreContext.makeLocallyVisible();
	}

	/**
	 * This function is called when a handle to this data store is added to a visible DDS.
	 */
	public attachGraph() {
		this.makeVisibleAndAttachGraph();
	}

	public bind(handle: IFluidHandle): void {
		// If visible, attach the incoming handle's graph. Else, this will be done when we become visible.
		if (this.visibilityState !== VisibilityState.NotVisible) {
			toFluidHandleInternal(handle).attachGraph();
			return;
		}
		this.pendingHandlesToMakeVisible.add(toFluidHandleInternal(handle));
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		this.verifyNotClosed();

		for (const [, object] of this.contexts) {
			object.setConnectionState(connected, clientId);
		}

		raiseConnectedEvent(this.logger, this, connected, clientId);
	}

	public getQuorum(): IQuorumClients {
		return this.quorum;
	}

	public getAudience(): IAudience {
		return this.audience;
	}

	public async uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		this.verifyNotClosed();

		return this.dataStoreContext.uploadBlob(blob, signal);
	}

	private createRemoteChannelContext(
		attachMessage: IAttachMessage,
		summarizerNodeParams: CreateChildSummarizerNodeParam,
	) {
		const flatBlobs = new Map<string, ArrayBufferLike>();
		const snapshotTree = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);

		return new RemoteChannelContext(
			this,
			this.dataStoreContext,
			this.dataStoreContext.storage,
			(content, localContentMetadata) =>
				this.submitChannelOp(attachMessage.id, content, localContentMetadata),
			(address: string) => this.setChannelDirty(address),
			attachMessage.id,
			snapshotTree,
			this.sharedObjectRegistry,
			flatBlobs,
			this.dataStoreContext.getCreateChildSummarizerNodeFn(
				attachMessage.id,
				summarizerNodeParams,
			),
			attachMessage.type,
		);
	}

	/**
	 * Process channel messages. The messages here are contiguous channel types messages in a batch for this data
	 * store.
	 * @param messageCollection - The collection of messages to process.
	 */
	private processChannelMessages(messageCollection: IRuntimeMessageCollection) {
		this.verifyNotClosed();

		/*
		 * Bunch contiguous messages for the same channel and send them together.
		 * This is an optimization where DDSes can process a bunch of ops together. DDSes
		 * like merge tree or shared tree can process ops more efficiently when they are bunched together.
		 */
		let currentAddress: string | undefined;
		let currentMessagesContent: IRuntimeMessagesContent[] = [];
		const { messagesContent, local } = messageCollection;

		const sendBunchedMessages = () => {
			// Current address will be undefined for the first message in the list.
			if (currentAddress === undefined) {
				return;
			}

			// process the last set of channel ops
			const channelContext = this.contexts.get(currentAddress);
			assert(!!channelContext, 0xa6b /* Channel context not found */);

			channelContext.processMessages({
				envelope: messageCollection.envelope,
				messagesContent: currentMessagesContent,
				local,
			});

			currentMessagesContent = [];
		};

		for (const { contents, ...restOfMessagesContent } of messagesContent) {
			const contentsEnvelope = contents as IEnvelope;

			// If the address of the message changes while processing the batch, send the current bunch.
			if (currentAddress !== contentsEnvelope.address) {
				sendBunchedMessages();
			}

			currentMessagesContent.push({
				contents: contentsEnvelope.contents,
				...restOfMessagesContent,
			});
			currentAddress = contentsEnvelope.address;
		}

		// Process the last bunch of messages.
		sendBunchedMessages();
	}

	private processAttachMessages(messageCollection: IRuntimeMessageCollection) {
		const { envelope, messagesContent, local } = messageCollection;
		for (const { contents } of messagesContent) {
			const attachMessage = contents as IAttachMessage;
			const id = attachMessage.id;

			// We need to process the GC Data for both local and remote attach messages
			processAttachMessageGCData(attachMessage.snapshot, (nodeId, toPath) => {
				// Note: nodeId will be "/" unless and until we support sub-DDS GC Nodes
				const fromPath = `/${this.id}/${id}${nodeId === "/" ? "" : nodeId}`;
				this.dataStoreContext.addedGCOutboundRoute(fromPath, toPath, envelope.timestamp);
			});

			// If a non-local operation then go and create the object
			// Otherwise mark it as officially attached.
			if (local) {
				assert(
					this.pendingAttach.delete(id),
					0x17c /* "Unexpected attach (local) channel OP" */,
				);
			} else {
				assert(!this.contexts.has(id), 0x17d /* "Unexpected attach channel OP" */);

				const summarizerNodeParams = {
					type: CreateSummarizerNodeSource.FromAttach,
					sequenceNumber: envelope.sequenceNumber,
					snapshot: attachMessage.snapshot,
				};

				const remoteChannelContext = this.createRemoteChannelContext(
					attachMessage,
					summarizerNodeParams,
				);
				this.contexts.set(id, remoteChannelContext);
			}
		}
	}

	/**
	 * Process messages for this data store. The messages here are contiguous messages in a batch.
	 * @param messageCollection - The collection of messages to process.
	 */
	public processMessages(messageCollection: IRuntimeMessageCollection): void {
		this.verifyNotClosed();

		const { envelope, messagesContent } = messageCollection;
		try {
			switch (envelope.type) {
				case DataStoreMessageType.ChannelOp:
					this.processChannelMessages(messageCollection);
					break;
				case DataStoreMessageType.Attach:
					this.processAttachMessages(messageCollection);
					break;
				default:
			}
		} catch (error) {
			throw DataProcessingError.wrapIfUnrecognized(
				error,
				"fluidDataStoreRuntimeFailedToProcessMessage",
				envelope,
			);
		}

		for (const { contents, clientSequenceNumber } of messagesContent) {
			this.emit("op", { ...envelope, contents, clientSequenceNumber });
		}
	}

	/**
	 * back-compat ADO 21575.
	 * @deprecated {@link FluidDataStoreRuntime.processMessages} should be used instead to process messages. This is still here for back-compat
	 * because it exists on IFluidDataStoreChannel. Once it is removed from the interface, this method can be removed.
	 */
	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		this.processMessages({
			envelope: message,
			messagesContent: [
				{
					contents: message.contents,
					localOpMetadata,
					clientSequenceNumber: message.clientSequenceNumber,
				},
			],
			local,
		});
	}

	public processSignal(message: IInboundSignalMessage, local: boolean) {
		this.emit("signal", message, local);
	}

	private isChannelAttached(id: string): boolean {
		return (
			// Added in createChannel
			// Removed when bindChannel is called
			!this.notBoundedChannelContextSet.has(id) &&
			// Added in bindChannel only if this is not attached yet
			// Removed when this is attached by calling attachGraph
			!this.localChannelContextQueue.has(id) &&
			// Added in attachChannel called by bindChannel
			// Removed when attach op is broadcast
			!this.pendingAttach.has(id)
		);
	}

	/**
	 * Returns the outbound routes of this channel. Currently, all contexts in this channel are considered
	 * referenced and are hence outbound. This will change when we have root and non-root channel contexts.
	 * The only root contexts will be considered as referenced.
	 */
	private getOutboundRoutes(): string[] {
		const outboundRoutes: string[] = [];
		for (const [contextId] of this.contexts) {
			outboundRoutes.push(`${this.absolutePath}/${contextId}`);
		}
		return outboundRoutes;
	}

	/**
	 * Updates the GC nodes of this channel. It does the following:
	 * - Adds a back route to self to all its child GC nodes.
	 * - Adds a node for this channel.
	 * @param builder - The builder that contains the GC nodes for this channel's children.
	 */
	private updateGCNodes(builder: GCDataBuilder) {
		// Add a back route to self in each child's GC nodes. If any child is referenced, then its parent should
		// be considered referenced as well.
		builder.addRouteToAllNodes(this.absolutePath);

		// Get the outbound routes and add a GC node for this channel.
		builder.addNode("/", this.getOutboundRoutes());
	}

	/**
	 * Returns a summary at the current sequence number.
	 * @param fullTree - true to bypass optimizations and force a full summary tree
	 * @param trackState - This tells whether we should track state from this summary.
	 * @param telemetryContext - summary data passed through the layers for telemetry purposes
	 */
	public async summarize(
		fullTree: boolean = false,
		trackState: boolean = true,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		const summaryBuilder = new SummaryTreeBuilder();
		await this.visitContextsDuringSummary(
			async (contextId: string, context: IChannelContext) => {
				const contextSummary = await context.summarize(fullTree, trackState, telemetryContext);
				summaryBuilder.addWithStats(contextId, contextSummary);
			},
		);
		return summaryBuilder.getSummaryTree();
	}

	/**
	 * Generates data used for garbage collection. This includes a list of GC nodes that represent this channel
	 * including any of its child channel contexts. Each node has a set of outbound routes to other GC nodes in the
	 * document. It does the following:
	 *
	 * 1. Calls into each child context to get its GC data.
	 *
	 * 2. Prefixes the child context's id to the GC nodes in the child's GC data. This makes sure that the node can be
	 * identified as belonging to the child.
	 *
	 * 3. Adds a GC node for this channel to the nodes received from the children. All these nodes together represent
	 * the GC data of this channel.
	 *
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		const builder = new GCDataBuilder();
		await this.visitContextsDuringSummary(
			async (contextId: string, context: IChannelContext) => {
				const contextGCData = await context.getGCData(fullGC);
				// Prefix the child's id to the ids of its GC nodes so they can be identified as belonging to the child.
				// This also gradually builds the id of each node to be a path from the root.
				builder.prefixAndAddNodes(contextId, contextGCData.gcNodes);
			},
		);
		this.updateGCNodes(builder);
		return builder.getGCData();
	}

	/**
	 * After GC has run, called to notify this channel of routes that are used in it. It calls the child contexts to
	 * update their used routes.
	 * @param usedRoutes - The routes that are used in all contexts in this channel.
	 */
	public updateUsedRoutes(usedRoutes: string[]) {
		// Get a map of channel ids to routes used in it.
		const usedContextRoutes = unpackChildNodesUsedRoutes(usedRoutes);

		// Verify that the used routes are correct.
		for (const [id] of usedContextRoutes) {
			assert(
				this.contexts.has(id),
				0x17e /* "Used route does not belong to any known context" */,
			);
		}

		// Update the used routes in each context. Used routes is empty for unused context.
		for (const [contextId, context] of this.contexts) {
			context.updateUsedRoutes(usedContextRoutes.get(contextId) ?? []);
		}
	}

	public getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		const summaryBuilder = new SummaryTreeBuilder();
		this.visitLocalBoundContextsDuringAttach(
			(contextId: string, context: LocalChannelContextBase) => {
				let summaryTree: ISummaryTreeWithStats;
				if (context.isLoaded) {
					const contextSummary = context.getAttachSummary(telemetryContext);
					assert(
						contextSummary.summary.type === SummaryType.Tree,
						0x180 /* "getAttachSummary should always return a tree" */,
					);

					summaryTree = { stats: contextSummary.stats, summary: contextSummary.summary };
				} else {
					// If this channel is not yet loaded, then there should be no changes in the snapshot from which
					// it was created as it is detached container. So just use the previous snapshot.
					assert(
						!!this.dataStoreContext.baseSnapshot,
						0x181 /* "BaseSnapshot should be there as detached container loaded from snapshot" */,
					);
					summaryTree = convertSnapshotTreeToSummaryTree(
						// TODO why are we non null asserting here?
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						this.dataStoreContext.baseSnapshot.trees[contextId]!,
					);
				}
				summaryBuilder.addWithStats(contextId, summaryTree);
			},
		);

		return summaryBuilder.getSummaryTree();
	}

	/**
	 * Get the GC Data for the initial state being attached so remote clients can learn of this DataStore's outbound routes
	 */
	public getAttachGCData(telemetryContext?: ITelemetryContext): IGarbageCollectionData {
		const gcDataBuilder = new GCDataBuilder();
		this.visitLocalBoundContextsDuringAttach(
			(contextId: string, context: LocalChannelContextBase) => {
				if (context.isLoaded) {
					const contextGCData = context.getAttachGCData(telemetryContext);

					// Incorporate the GC Data for this context
					gcDataBuilder.prefixAndAddNodes(contextId, contextGCData.gcNodes);
				}
				// else: Rehydrating detached container case. GC doesn't run until the container is attached, so nothing to do here.
			},
		);
		this.updateGCNodes(gcDataBuilder);

		return gcDataBuilder.getGCData();
	}

	/**
	 * Helper method for preparing to summarize this channel.
	 * Runs the callback for each bound context to incorporate its data however the caller specifies
	 */
	private async visitContextsDuringSummary(
		visitor: (contextId: string, context: IChannelContext) => Promise<void>,
	): Promise<void> {
		for (const [contextId, context] of this.contexts) {
			const isAttached = this.isChannelAttached(contextId);
			// We are not expecting local dds! Summary / GC data may not capture local state.
			assert(isAttached, 0x17f /* "Not expecting detached channels during summarize" */);
			await visitor(contextId, context);
		}
	}

	/**
	 * Helper method for preparing to attach this dataStore.
	 * Runs the callback for each bound context to incorporate its data however the caller specifies
	 */
	private visitLocalBoundContextsDuringAttach(
		visitor: (contextId: string, context: LocalChannelContextBase) => void,
	): void {
		/**
		 * back-compat 0.59.1000 - getAttachSummary() is called when making a data store globally visible (previously
		 * attaching state). Ideally, attachGraph() should have already be called making it locally visible. However,
		 * before visibility state was added, this may not have been the case and getAttachSummary() could be called:
		 *
		 * 1. Before attaching the data store - When a detached container is attached.
		 *
		 * 2. After attaching the data store - When a data store is created and bound in an attached container.
		 *
		 * The basic idea is that all local object should become locally visible before they are globally visible.
		 */
		this.attachGraph();

		// This assert cannot be added now due to back-compat. To be uncommented when the following issue is fixed -
		// https://github.com/microsoft/FluidFramework/issues/9688.
		//
		// assert(this.visibilityState === VisibilityState.LocallyVisible,
		//  "The data store should be locally visible when generating attach summary",
		// );

		const visitedContexts = new Set<string>();
		let visitedLength = -1;
		while (visitedLength !== visitedContexts.size) {
			// detect changes in the visitedContexts set, as on visiting a context
			// it could could make contexts available by removing other contexts
			// from the notBoundedChannelContextSet, so we need to ensure those get processed as well.
			// only once the loop can run with no new contexts added to the visitedContexts set do we
			// know for sure all possible contexts have been visited.
			visitedLength = visitedContexts.size;
			for (const [contextId, context] of this.contexts) {
				if (!(context instanceof LocalChannelContextBase)) {
					throw new LoggingError("Should only be called with local channel handles");
				}

				if (
					!visitedContexts.has(contextId) &&
					!this.notBoundedChannelContextSet.has(contextId)
				) {
					visitor(contextId, context);
					visitedContexts.add(contextId);
				}
			}
		}
	}

	public submitMessage(type: DataStoreMessageType, content: any, localOpMetadata: unknown) {
		this.submit(type, content, localOpMetadata);
	}

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal. Should be a JSON serializable object or primitive.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	public submitSignal(type: string, content: unknown, targetClientId?: string) {
		this.verifyNotClosed();
		return this.dataStoreContext.submitSignal(type, content, targetClientId);
	}

	/**
	 * Will return when the data store is attached.
	 */
	public async waitAttached(): Promise<void> {
		return this.deferredAttached.promise;
	}

	/**
	 * Assuming this DataStore is already attached, this will make the given channel locally visible
	 * by submitting its attach op.
	 */
	private makeChannelLocallyVisible(channel: IChannel): void {
		this.verifyNotClosed();
		// If this handle is already attached no need to attach again.
		if (channel.handle.isAttached) {
			return;
		}

		toFluidHandleInternal(channel.handle).attachGraph();

		assert(
			this.isAttached,
			0x182 /* "Data store should be attached to attach the channel." */,
		);
		assert(
			this.visibilityState === VisibilityState.GloballyVisible,
			0x2d0 /* "Data store should be globally visible to attach channels." */,
		);

		const summarizeResult = summarizeChannel(
			channel,
			true /* fullTree */,
			false /* trackState */,
		);

		// We need to include the channel's GC Data so remote clients can learn of this channel's outbound routes
		const gcData = channel.getGCData(/* fullGC: */ true);
		addBlobToSummary(summarizeResult, gcDataBlobKey, JSON.stringify(gcData));

		// Attach message needs the summary in ITree format. Convert the ISummaryTree into an ITree.
		const snapshot = convertSummaryTreeToITree(summarizeResult.summary);

		const message: IAttachMessage = {
			id: channel.id,
			snapshot,
			type: channel.attributes.type,
		};
		this.pendingAttach.add(channel.id);
		this.submit(DataStoreMessageType.Attach, message);

		const context = this.contexts.get(channel.id) as LocalChannelContextBase;
		context.makeVisible();
	}

	private submitChannelOp(address: string, contents: any, localOpMetadata: unknown) {
		const envelope: IEnvelope = { address, contents };
		this.submit(DataStoreMessageType.ChannelOp, envelope, localOpMetadata);
	}

	private submit(
		type: DataStoreMessageType,
		content: any,
		localOpMetadata: unknown = undefined,
	): void {
		this.verifyNotClosed();
		this.dataStoreContext.submitMessage(type, content, localOpMetadata);
	}

	/**
	 * For messages of type MessageType.Operation, finds the right channel and asks it to resubmit the message.
	 * For all other messages, just submit it again.
	 * This typically happens when we reconnect and there are unacked messages.
	 * @param content - The content of the original message.
	 * @param localOpMetadata - The local metadata associated with the original message.
	 */
	public reSubmit(type: DataStoreMessageType, content: any, localOpMetadata: unknown) {
		this.verifyNotClosed();

		switch (type) {
			case DataStoreMessageType.ChannelOp: {
				// For Operations, find the right channel and trigger resubmission on it.
				const envelope = content as IEnvelope;
				const channelContext = this.contexts.get(envelope.address);
				assert(!!channelContext, 0x183 /* "There should be a channel context for the op" */);
				channelContext.reSubmit(envelope.contents, localOpMetadata);
				break;
			}
			case DataStoreMessageType.Attach:
				// For Attach messages, just submit them again.
				this.submit(type, content, localOpMetadata);
				break;
			default:
				unreachableCase(type);
		}
	}

	/**
	 * Revert a local op.
	 * @param content - The content of the original message.
	 * @param localOpMetadata - The local metadata associated with the original message.
	 */
	public rollback?(type: DataStoreMessageType, content: any, localOpMetadata: unknown) {
		this.verifyNotClosed();

		switch (type) {
			case DataStoreMessageType.ChannelOp: {
				// For Operations, find the right channel and trigger resubmission on it.
				const envelope = content as IEnvelope;
				const channelContext = this.contexts.get(envelope.address);
				assert(!!channelContext, 0x2ed /* "There should be a channel context for the op" */);
				channelContext.rollback(envelope.contents, localOpMetadata);
				break;
			}
			default:
				throw new LoggingError(`Can't rollback ${type} message`);
		}
	}

	public async applyStashedOp(content: any): Promise<unknown> {
		const type = content?.type as DataStoreMessageType;
		switch (type) {
			case DataStoreMessageType.Attach: {
				const attachMessage = content.content as IAttachMessage;

				const flatBlobs = new Map<string, ArrayBufferLike>();
				const snapshotTree = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);

				const channelContext = this.createRehydratedLocalChannelContext(
					attachMessage.id,
					snapshotTree,
					flatBlobs,
				);
				await channelContext.getChannel();
				this.contexts.set(attachMessage.id, channelContext);
				if (this.attachState === AttachState.Detached) {
					this.localChannelContextQueue.set(attachMessage.id, channelContext);
				} else {
					channelContext.makeVisible();
					this.pendingAttach.add(attachMessage.id);
				}
				return;
			}
			case DataStoreMessageType.ChannelOp: {
				const envelope = content.content as IEnvelope;
				const channelContext = this.contexts.get(envelope.address);
				assert(!!channelContext, 0x184 /* "There should be a channel context for the op" */);
				await channelContext.getChannel();
				return channelContext.applyStashedOp(envelope.contents);
			}
			default:
				unreachableCase(type);
		}
	}

	private setChannelDirty(address: string): void {
		this.verifyNotClosed();
		this.dataStoreContext.setChannelDirty(address);
	}

	private attachListener() {
		this.setMaxListeners(Number.MAX_SAFE_INTEGER);

		// back-compat, to be removed in the future.
		// Added in "2.0.0-rc.2.0.0" timeframe.
		(this.dataStoreContext as any).once?.("attaching", () => {
			this.setAttachState(AttachState.Attaching);
		});

		// back-compat, to be removed in the future.
		// Added in "2.0.0-rc.2.0.0" timeframe.
		(this.dataStoreContext as any).once?.("attached", () => {
			this.setAttachState(AttachState.Attached);
		});
	}

	private verifyNotClosed() {
		if (this._disposed) {
			throw new LoggingError("Runtime is closed");
		}
	}

	/**
	 * Summarizer client should not have local changes. These changes can become part of the summary and can break
	 * eventual consistency. For example, the next summary (say at ref seq# 100) may contain these changes whereas
	 * other clients that are up-to-date till seq# 100 may not have them yet.
	 */
	private identifyLocalChangeInSummarizer(
		eventName: string,
		channelId: string,
		channelType: string,
	) {
		if (this.clientDetails.type !== "summarizer" || this.localChangesTelemetryCount <= 0) {
			return;
		}

		// Log a telemetry if there are local changes in the summarizer. This will give us data on how often
		// this is happening and which data stores do this. The eventual goal is to disallow local changes
		// in the summarizer and the data will help us plan this.
		this.mc.logger.sendTelemetryEvent({
			eventName,
			...tagCodeArtifacts({
				channelType,
				channelId,
				fluidDataStoreId: this.id,
				fluidDataStorePackagePath: this.dataStoreContext.packagePath.join("/"),
			}),
			stack: generateStack(30),
		});
		this.localChangesTelemetryCount--;
	}

	public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
		switch (attachState) {
			case AttachState.Attaching:
				/**
				 * back-compat 0.59.1000 - Ideally, attachGraph() should have already been called making the data store
				 * locally visible. However, before visibility state was added, this may not have been the case and data
				 * store can move to "attaching" state in 2 scenarios:
				 * 1) Before attachGraph() is called - When a data store is created and bound in an attached container.
				 * 2) After attachGraph() is called - When a detached container is attached.
				 *
				 * The basic idea is that all local object should become locally visible before they are globally visible.
				 */
				this.attachGraph();

				this._attachState = AttachState.Attaching;

				assert(
					this.visibilityState === VisibilityState.LocallyVisible,
					0x2d1 /* "Data store should be locally visible before it can become globally visible." */,
				);

				// Mark the data store globally visible and make its child channels visible as well.
				this.visibilityState = VisibilityState.GloballyVisible;
				this.localChannelContextQueue.forEach((channel) => {
					channel.makeVisible();
				});
				this.localChannelContextQueue.clear();

				// This promise resolution will be moved to attached event once we fix the scheduler.
				this.deferredAttached.resolve();
				this.emit("attaching");
				break;
			case AttachState.Attached:
				assert(
					this.visibilityState === VisibilityState.GloballyVisible,
					0x2d2 /* "Data store should be globally visible when its attached." */,
				);
				this._attachState = AttachState.Attached;
				this.emit("attached");
				break;
			default:
				unreachableCase(attachState, "unreached");
		}
	}
}

/**
 * Mixin class that adds request handler to FluidDataStoreRuntime
 * Request handler is only called when data store can't resolve request, i.e. for custom requests.
 * @param Base - base class, inherits from FluidDataStoreRuntime
 * @param requestHandler - request handler to mix in
 * @legacy
 * @alpha
 */
export const mixinRequestHandler = (
	requestHandler: (request: IRequest, runtime: FluidDataStoreRuntime) => Promise<IResponse>,
	Base: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
) =>
	class RuntimeWithRequestHandler extends Base {
		public async request(request: IRequest) {
			const response = await super.request(request);
			if (response.status === 404) {
				return requestHandler(request, this);
			}
			return response;
		}
	} as typeof FluidDataStoreRuntime;

/**
 * Mixin class that adds await for DataObject to finish initialization before we proceed to summary.
 * @param handler - handler that returns info about blob to be added to summary.
 * Or undefined not to add anything to summary.
 * @param Base - base class, inherits from FluidDataStoreRuntime
 * @legacy
 * @alpha
 */
export const mixinSummaryHandler = (
	handler: (
		runtime: FluidDataStoreRuntime,
	) => Promise<{ path: string[]; content: string } | undefined>,
	Base: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
) =>
	class RuntimeWithSummarizerHandler extends Base {
		private addBlob(summary: ISummaryTreeWithStats, path: string[], content: string) {
			const firstName = path.shift();
			if (firstName === undefined) {
				throw new LoggingError("Path can't be empty");
			}

			let blob: ISummaryTree | ISummaryBlob = {
				type: SummaryType.Blob,
				content,
			};
			summary.stats.blobNodeCount++;
			summary.stats.totalBlobSize += content.length;

			for (const name of path.reverse()) {
				blob = {
					type: SummaryType.Tree,
					tree: { [name]: blob },
				};
				summary.stats.treeNodeCount++;
			}
			summary.summary.tree[firstName] = blob;
		}

		async summarize(...args: any[]) {
			const summary = await super.summarize(...args);

			try {
				const content = await handler(this);
				if (content !== undefined) {
					this.addBlob(summary, content.path, content.content);
				}
			} catch (e) {
				// Any error coming from app-provided handler should be marked as DataProcessingError
				throw DataProcessingError.wrapIfUnrecognized(e, "mixinSummaryHandler");
			}

			return summary;
		}
	} as typeof FluidDataStoreRuntime;

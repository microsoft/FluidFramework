/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import {
	FluidObject,
	IDisposable,
	IRequest,
	IResponse,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { assert, Lazy, LazyPromise } from "@fluidframework/core-utils/internal";
import { FluidObjectHandle } from "@fluidframework/datastore/internal";
import type { ISnapshot } from "@fluidframework/driver-definitions/internal";
import {
	ISnapshotTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	buildSnapshotTree,
	getSnapshotTree,
	isInstanceOfISnapshot,
} from "@fluidframework/driver-utils/internal";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	IGarbageCollectionData,
	AliasResult,
	CreateSummarizerNodeSource,
	IAttachMessage,
	IEnvelope,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreContextDetached,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	IFluidParentContext,
	ISummarizeResult,
	NamedFluidDataStoreRegistryEntries,
	channelsTreeName,
	IInboundSignalMessage,
	gcDataBlobKey,
	type IRuntimeMessagesContent,
	type InboundAttachMessage,
	type IRuntimeMessageCollection,
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
	encodeCompactIdToString,
	isSerializedHandle,
	processAttachMessageGCData,
	responseToException,
	unpackChildNodesUsedRoutes,
} from "@fluidframework/runtime-utils/internal";
import {
	DataCorruptionError,
	DataProcessingError,
	LoggingError,
	MonitoringContext,
	createChildLogger,
	createChildMonitoringContext,
	extractSafePropertiesFromMessage,
	tagCodeArtifacts,
	type ITelemetryPropertiesExt,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	DeletedResponseHeaderKey,
	RuntimeHeaderData,
	defaultRuntimeHeaderData,
} from "./containerRuntime.js";
import {
	IDataStoreAliasMessage,
	channelToDataStore,
	isDataStoreAliasMessage,
} from "./dataStore.js";
import {
	FluidDataStoreContext,
	IFluidDataStoreContextInternal,
	ILocalDetachedFluidDataStoreContextProps,
	LocalDetachedFluidDataStoreContext,
	LocalFluidDataStoreContext,
	RemoteFluidDataStoreContext,
	createAttributesBlob,
} from "./dataStoreContext.js";
import { DataStoreContexts } from "./dataStoreContexts.js";
import { FluidDataStoreRegistry } from "./dataStoreRegistry.js";
import { GCNodeType, IGCNodeUpdatedProps, urlToGCNodePath } from "./gc/index.js";
import { ContainerMessageType, LocalContainerRuntimeMessage } from "./messageTypes.js";
import { StorageServiceWithAttachBlobs } from "./storageServiceWithAttachBlobs.js";
import {
	IContainerRuntimeMetadata,
	nonDataStorePaths,
	rootHasIsolatedChannels,
} from "./summary/index.js";

/**
 * Accepted header keys for requests coming to the runtime.
 * @internal
 */
export enum RuntimeHeaders {
	/**
	 * True to wait for a data store to be created and loaded before returning it.
	 */
	wait = "wait",
	/**
	 * True if the request is coming from an IFluidHandle.
	 */
	viaHandle = "viaHandle",
}

/**
 * True if a tombstoned object should be returned without erroring
 * @legacy
 * @alpha
 */
export const AllowTombstoneRequestHeaderKey = "allowTombstone"; // Belongs in the enum above, but avoiding the breaking change

type PendingAliasResolve = (success: boolean) => void;

interface FluidDataStoreMessage {
	content: unknown;
	type: string;
}

/**
 * Creates a shallow wrapper of {@link IFluidParentContext}. The wrapper can then have its methods overwritten as needed
 */
export function wrapContext(context: IFluidParentContext): IFluidParentContext {
	return {
		get IFluidDataStoreRegistry() {
			return context.IFluidDataStoreRegistry;
		},
		IFluidHandleContext: context.IFluidHandleContext,
		options: context.options,
		get clientId() {
			return context.clientId;
		},
		get connected() {
			return context.connected;
		},
		deltaManager: context.deltaManager,
		storage: context.storage,
		baseLogger: context.baseLogger,
		get clientDetails() {
			return context.clientDetails;
		},
		get idCompressor() {
			return context.idCompressor;
		},
		loadingGroupId: context.loadingGroupId,
		get attachState() {
			return context.attachState;
		},
		containerRuntime: context.containerRuntime,
		scope: context.scope,
		gcThrowOnTombstoneUsage: context.gcThrowOnTombstoneUsage,
		gcTombstoneEnforcementAllowed: context.gcTombstoneEnforcementAllowed,
		getAbsoluteUrl: async (...args) => {
			return context.getAbsoluteUrl(...args);
		},
		getQuorum: (...args) => {
			return context.getQuorum(...args);
		},
		getAudience: (...args) => {
			return context.getAudience(...args);
		},
		submitMessage: (...args) => {
			return context.submitMessage(...args);
		},
		submitSignal: (...args) => {
			return context.submitSignal(...args);
		},
		makeLocallyVisible: (...args) => {
			return context.makeLocallyVisible(...args);
		},
		uploadBlob: async (...args) => {
			return context.uploadBlob(...args);
		},
		addedGCOutboundRoute: (...args) => {
			return context.addedGCOutboundRoute(...args);
		},
		getCreateChildSummarizerNodeFn: (...args) => {
			return context.getCreateChildSummarizerNodeFn?.(...args);
		},
		deleteChildSummarizerNode: (...args) => {
			return context.deleteChildSummarizerNode(...args);
		},
		setChannelDirty: (address: string) => {
			return context.setChannelDirty(address);
		},
	};
}

/**
 * Creates a wrapper of a {@link IFluidParentContext} to be provided to the inner datastore channels.
 * The wrapper will have the submit methods overwritten with the appropriate id as the destination address.
 *
 * @param id - the id of the channel
 * @param parentContext - the {@link IFluidParentContext} to wrap
 * @returns A wrapped {@link IFluidParentContext}
 */
function wrapContextForInnerChannel(
	id: string,
	parentContext: IFluidParentContext,
): IFluidParentContext {
	const context = wrapContext(parentContext);

	context.submitMessage = (type: string, content: unknown, localOpMetadata: unknown) => {
		const fluidDataStoreContent: FluidDataStoreMessage = {
			content,
			type,
		};
		const envelope: IEnvelope = {
			address: id,
			contents: fluidDataStoreContent,
		};
		parentContext.submitMessage(
			ContainerMessageType.FluidDataStoreOp,
			envelope,
			localOpMetadata,
		);
	};

	context.submitSignal = (type: string, contents: unknown, targetClientId?: string) => {
		const envelope: IEnvelope = {
			address: id,
			contents,
		};
		parentContext.submitSignal(type, envelope, targetClientId);
	};

	return context;
}

/**
 * Returns the type of the given local data store from its package path.
 */
export function getLocalDataStoreType(localDataStore: LocalFluidDataStoreContext): string {
	return localDataStore.packagePath[localDataStore.packagePath.length - 1];
}

/**
 * This class encapsulates data store handling. Currently it is only used by the container runtime,
 * but eventually could be hosted on any channel once we formalize the channel api boundary.
 * @internal
 */
export class ChannelCollection implements IFluidDataStoreChannel, IDisposable {
	// Stores tracked by the Domain
	private readonly pendingAttach = new Map<string, IAttachMessage>();
	// 0.24 back-compat attachingBeforeSummary
	public readonly attachOpFiredForDataStore = new Set<string>();

	protected readonly mc: MonitoringContext;

	private readonly disposeOnce = new Lazy<void>(() => this.contexts.dispose());

	public readonly entryPoint: IFluidHandleInternal<FluidObject>;

	public readonly containerLoadStats: {
		// number of dataStores during loadContainer
		readonly containerLoadDataStoreCount: number;
		// number of unreferenced dataStores during loadContainer
		readonly referencedDataStoreCount: number;
	};

	private readonly pendingAliasMap: Map<string, Promise<AliasResult>> = new Map<
		string,
		Promise<AliasResult>
	>();

	protected readonly contexts: DataStoreContexts;
	private readonly aliasedDataStores: Set<string>;

	constructor(
		protected readonly baseSnapshot: ISnapshotTree | ISnapshot | undefined,
		public readonly parentContext: IFluidParentContext,
		baseLogger: ITelemetryBaseLogger,
		private readonly gcNodeUpdated: (props: IGCNodeUpdatedProps) => void,
		private readonly isDataStoreDeleted: (nodePath: string) => boolean,
		private readonly aliasMap: Map<string, string>,
		provideEntryPoint: (runtime: ChannelCollection) => Promise<FluidObject>,
	) {
		this.mc = createChildMonitoringContext({ logger: baseLogger });
		this.contexts = new DataStoreContexts(baseLogger);
		this.entryPoint = new FluidObjectHandle<FluidObject>(
			new LazyPromise(async () => provideEntryPoint(this)),
			"",
			this.parentContext.IFluidHandleContext,
		);
		this.aliasedDataStores = new Set(aliasMap.values());

		// Extract stores stored inside the snapshot
		const fluidDataStores = new Map<string, ISnapshotTree>();
		if (baseSnapshot) {
			const baseSnapshotTree = getSnapshotTree(baseSnapshot);
			for (const [key, value] of Object.entries(baseSnapshotTree.trees)) {
				fluidDataStores.set(key, value);
			}
		}

		let unreferencedDataStoreCount = 0;
		// Create a context for each of them
		for (const [key, value] of fluidDataStores) {
			let dataStoreContext: FluidDataStoreContext;

			// counting number of unreferenced data stores
			if (value.unreferenced) {
				unreferencedDataStoreCount++;
			}
			// If we have a detached container, then create local data store contexts.
			if (this.parentContext.attachState !== AttachState.Detached) {
				let snapshotForRemoteFluidDatastoreContext: ISnapshot | ISnapshotTree = value;
				if (isInstanceOfISnapshot(baseSnapshot)) {
					snapshotForRemoteFluidDatastoreContext = {
						...baseSnapshot,
						snapshotTree: value,
					};
				}
				dataStoreContext = new RemoteFluidDataStoreContext({
					id: key,
					snapshot: snapshotForRemoteFluidDatastoreContext,
					parentContext: this.wrapContextForInnerChannel(key),
					storage: this.parentContext.storage,
					scope: this.parentContext.scope,
					createSummarizerNodeFn: this.parentContext.getCreateChildSummarizerNodeFn(key, {
						type: CreateSummarizerNodeSource.FromSummary,
					}),
					loadingGroupId: value.groupId,
				});
			} else {
				if (typeof value !== "object") {
					throw new LoggingError("Snapshot should be there to load from!!");
				}
				const snapshotTree = value;
				dataStoreContext = new LocalFluidDataStoreContext({
					id: key,
					pkg: undefined,
					parentContext: this.wrapContextForInnerChannel(key),
					storage: this.parentContext.storage,
					scope: this.parentContext.scope,
					createSummarizerNodeFn: this.parentContext.getCreateChildSummarizerNodeFn(key, {
						type: CreateSummarizerNodeSource.FromSummary,
					}),
					makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(key),
					snapshotTree,
				});
			}
			this.contexts.addBoundOrRemoted(dataStoreContext);
		}
		this.containerLoadStats = {
			containerLoadDataStoreCount: fluidDataStores.size,
			referencedDataStoreCount: fluidDataStores.size - unreferencedDataStoreCount,
		};
	}

	public get aliases(): ReadonlyMap<string, string> {
		return this.aliasMap;
	}

	public get pendingAliases(): Map<string, Promise<AliasResult>> {
		return this.pendingAliasMap;
	}

	public async waitIfPendingAlias(maybeAlias: string): Promise<AliasResult> {
		const pendingAliasPromise = this.pendingAliases.get(maybeAlias);
		return pendingAliasPromise ?? "Success";
	}

	/**
	 * For sampling. Only log once per container
	 */
	private shouldSendAttachLog = true;

	protected wrapContextForInnerChannel(id: string): IFluidParentContext {
		return wrapContextForInnerChannel(id, this.parentContext);
	}

	/**
	 * IFluidDataStoreChannel.makeVisibleAndAttachGraph implementation
	 * Not clear when it would be called and what it should do.
	 * Currently this API is called by context only for root data stores.
	 */
	public makeVisibleAndAttachGraph(): void {
		this.parentContext.makeLocallyVisible();
	}

	private processAttachMessages(messageCollection: IRuntimeMessageCollection): void {
		const { envelope, messagesContent, local } = messageCollection;
		for (const { contents } of messagesContent) {
			const attachMessage = contents as InboundAttachMessage;
			// We need to process the GC Data for both local and remote attach messages
			const foundGCData = processAttachMessageGCData(
				attachMessage.snapshot,
				(nodeId, toPath) => {
					// nodeId is the relative path under the node being attached. Always starts with "/", but no trailing "/" after an id
					const fromPath = `/${attachMessage.id}${nodeId === "/" ? "" : nodeId}`;
					this.parentContext.addedGCOutboundRoute(fromPath, toPath, envelope.timestamp);
				},
			);

			// Only log once per container to avoid noise/cost.
			// Allows longitudinal tracking of various state (e.g. foundGCData), and some sampled details
			if (this.shouldSendAttachLog) {
				this.shouldSendAttachLog = false;
				this.mc.logger.sendTelemetryEvent({
					eventName: "dataStoreAttachMessage_sampled",
					...tagCodeArtifacts({ id: attachMessage.id, pkg: attachMessage.type }),
					details: {
						local,
						snapshot: !!attachMessage.snapshot,
						foundGCData,
					},
					...extractSafePropertiesFromMessage(envelope),
				});
			}

			// The local object has already been attached
			if (local) {
				assert(
					this.pendingAttach.has(attachMessage.id),
					0x15e /* "Local object does not have matching attach message id" */,
				);
				this.contexts.get(attachMessage.id)?.setAttachState(AttachState.Attached);
				this.pendingAttach.delete(attachMessage.id);
				continue;
			}

			// If a non-local operation then go and create the object, otherwise mark it as officially attached.
			if (this.alreadyProcessed(attachMessage.id)) {
				// TODO: dataStoreId may require a different tag from PackageData #7488
				const error = new DataCorruptionError(
					// pre-0.58 error message: duplicateDataStoreCreatedWithExistingId
					"Duplicate DataStore created with existing id",
					{
						...extractSafePropertiesFromMessage(envelope),
						...tagCodeArtifacts({ dataStoreId: attachMessage.id }),
					},
				);
				throw error;
			}

			const flatAttachBlobs = new Map<string, ArrayBufferLike>();
			let snapshot: ISnapshotTree | ISnapshot | undefined;
			if (attachMessage.snapshot) {
				snapshot = buildSnapshotTree(attachMessage.snapshot.entries, flatAttachBlobs);
				if (isInstanceOfISnapshot(this.baseSnapshot)) {
					snapshot = { ...this.baseSnapshot, snapshotTree: snapshot };
				}
			}

			// Include the type of attach message which is the pkg of the store to be
			// used by RemoteFluidDataStoreContext in case it is not in the snapshot.
			const pkg = [attachMessage.type];
			const remoteFluidDataStoreContext = new RemoteFluidDataStoreContext({
				id: attachMessage.id,
				snapshot,
				parentContext: this.wrapContextForInnerChannel(attachMessage.id),
				storage: new StorageServiceWithAttachBlobs(
					this.parentContext.storage,
					flatAttachBlobs,
				),
				scope: this.parentContext.scope,
				loadingGroupId: attachMessage.snapshot?.groupId,
				createSummarizerNodeFn: this.parentContext.getCreateChildSummarizerNodeFn(
					attachMessage.id,
					{
						type: CreateSummarizerNodeSource.FromAttach,
						sequenceNumber: envelope.sequenceNumber,
						snapshot: attachMessage.snapshot ?? {
							entries: [createAttributesBlob(pkg, true /* isRootDataStore */)],
						},
					},
				),
				pkg,
			});

			this.contexts.addBoundOrRemoted(remoteFluidDataStoreContext);
		}
	}

	private processAliasMessages(messageCollection: IRuntimeMessageCollection): void {
		const { envelope, messagesContent, local } = messageCollection;
		for (const { contents, localOpMetadata } of messagesContent) {
			const aliasMessage = contents as IDataStoreAliasMessage;
			if (!isDataStoreAliasMessage(aliasMessage)) {
				throw new DataCorruptionError("malformedDataStoreAliasMessage", {
					...extractSafePropertiesFromMessage(envelope),
				});
			}

			const resolve = localOpMetadata as PendingAliasResolve;
			const aliasResult = this.processAliasMessageCore(
				aliasMessage.internalId,
				aliasMessage.alias,
				envelope.timestamp,
			);
			if (local) {
				resolve(aliasResult);
			}
		}
	}

	public processAliasMessageCore(
		internalId: string,
		alias: string,
		messageTimestampMs?: number,
	): boolean {
		if (this.alreadyProcessed(alias)) {
			return false;
		}

		const context = this.contexts.get(internalId);
		// If the data store has been deleted, log an error and ignore this message. This helps prevent document
		// corruption in case a deleted data store accidentally submitted a signal.
		if (this.checkAndLogIfDeleted(internalId, context, "Changed", "processAliasMessageCore")) {
			return false;
		}

		if (context === undefined) {
			this.mc.logger.sendErrorEvent({
				eventName: "AliasFluidDataStoreNotFound",
				fluidDataStoreId: internalId,
			});
			return false;
		}

		// If message timestamp doesn't exist, this is called in a detached container. Don't notify GC in that case
		// because it doesn't run in detached container and doesn't need to know about this route.
		if (messageTimestampMs) {
			this.parentContext.addedGCOutboundRoute("/", `/${internalId}`, messageTimestampMs);
		}

		this.aliasMap.set(alias, context.id);
		this.aliasedDataStores.add(context.id);
		context.setInMemoryRoot();
		return true;
	}

	private alreadyProcessed(id: string): boolean {
		return this.aliasMap.get(id) !== undefined || this.contexts.get(id) !== undefined;
	}

	/**
	 * Package up the context's attach summary etc into an IAttachMessage
	 */
	private generateAttachMessage(localContext: LocalFluidDataStoreContext): IAttachMessage {
		// Get the attach summary.
		const attachSummary = localContext.getAttachSummary();

		// Get the GC data and add it to the attach summary.
		const attachGCData = localContext.getAttachGCData();
		addBlobToSummary(attachSummary, gcDataBlobKey, JSON.stringify(attachGCData));

		// Attach message needs the summary in ITree format. Convert the ISummaryTree into an ITree.
		const snapshot = convertSummaryTreeToITree(attachSummary.summary);

		return {
			id: localContext.id,
			snapshot,
			type: getLocalDataStoreType(localContext),
		} satisfies IAttachMessage;
	}

	/**
	 * Make the data store locally visible in the container graph by moving the data store context from unbound to
	 * bound list and submitting the attach message. This data store can now be reached from the root.
	 * @param id - The id of the data store context to make visible.
	 */
	private makeDataStoreLocallyVisible(id: string): void {
		const localContext = this.contexts.getUnbound(id);
		assert(!!localContext, 0x15f /* "Could not find unbound context to bind" */);

		/**
		 * If the container is not detached, it is globally visible to all clients. This data store should also be
		 * globally visible. Move it to attaching state and send an "attach" op for it.
		 * If the container is detached, this data store will be part of the summary that makes the container attached.
		 */
		if (this.parentContext.attachState !== AttachState.Detached) {
			this.submitAttachChannelOp(localContext);
			localContext.setAttachState(AttachState.Attaching);
		}

		this.contexts.bind(id);
	}

	protected submitAttachChannelOp(localContext: LocalFluidDataStoreContext): void {
		const message = this.generateAttachMessage(localContext);
		this.pendingAttach.set(localContext.id, message);
		this.parentContext.submitMessage(ContainerMessageType.Attach, message, undefined);
		this.attachOpFiredForDataStore.add(localContext.id);
	}

	/**
	 * Generate compact internal DataStore ID.
	 *
	 * A note about namespace and name collisions:
	 * This code assumes that that's the only way to generate internal IDs, and that it's Ok for this namespace to overlap with
	 * user-provided alias names namespace.
	 * There are two scenarios where it could cause trouble:
	 * 1) Old files, where (already removed) CreateRoot*DataStore*() API was used, and thus internal name of data store
	 * was provided by user. Such files may experience name collision with future data stores that receive a name generated
	 * by this function.
	 * 2) Much less likely, but if it happen that internal ID (generated by this function) is exactly the same as alias name
	 * that user might use in the future, them ContainerRuntime.getAliasedDataStoreEntryPoint() or
	 * ContainerRuntime.getDataStoreFromRequest() could return a data store with internalID matching user request, even though
	 * user expected some other data store (that would receive alias later).
	 * Please note that above mentioned functions have the implementation they have (allowing #2) due to #1.
	 */
	protected createDataStoreId(): string {
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
			// In first two cases we will encode result as strings in more compact form.
			if (this.parentContext.attachState === AttachState.Detached) {
				// container is detached, only one client observes content,  no way to hit collisions with other clients.
				return encodeCompactIdToString(2 * this.contexts.size);
			}
			const id = this.parentContext.containerRuntime.generateDocumentUniqueId();
			if (typeof id === "number") {
				return encodeCompactIdToString(2 * id + 1);
			}
			return id;
		}
		return uuid();
	}

	public createDetachedDataStore(
		pkg: Readonly<string[]>,
		loadingGroupId?: string,
	): IFluidDataStoreContextDetached {
		return this.createContext(
			this.createDataStoreId(),
			pkg,
			LocalDetachedFluidDataStoreContext,
			loadingGroupId,
		);
	}

	public createDataStoreContext(
		pkg: Readonly<string[]>,
		loadingGroupId?: string,
	): IFluidDataStoreContextInternal {
		return this.createContext(
			this.createDataStoreId(),
			pkg,
			LocalFluidDataStoreContext,
			loadingGroupId,
		);
	}

	protected createContext<T extends LocalFluidDataStoreContext>(
		id: string,
		pkg: Readonly<string[]>,
		contextCtor: new (props: ILocalDetachedFluidDataStoreContextProps) => T,
		loadingGroupId?: string,
	): T {
		assert(loadingGroupId !== "", 0x974 /* loadingGroupId should not be the empty string */);
		const context = new contextCtor({
			id,
			pkg,
			parentContext: this.wrapContextForInnerChannel(id),
			storage: this.parentContext.storage,
			scope: this.parentContext.scope,
			createSummarizerNodeFn: this.parentContext.getCreateChildSummarizerNodeFn(id, {
				type: CreateSummarizerNodeSource.Local,
			}),
			makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(id),
			snapshotTree: undefined,
			loadingGroupId,
			channelToDataStoreFn: (channel: IFluidDataStoreChannel) =>
				channelToDataStore(
					channel,
					id,
					this,
					createChildLogger({ logger: this.parentContext.baseLogger }),
				),
		});

		this.contexts.addUnbound(context);
		return context;
	}

	public get disposed(): boolean {
		return this.disposeOnce.evaluated;
	}
	public readonly dispose = (): void => this.disposeOnce.value;

	public reSubmit(type: string, content: unknown, localOpMetadata: unknown): void {
		switch (type) {
			case ContainerMessageType.Attach:
			case ContainerMessageType.Alias: {
				this.parentContext.submitMessage(type, content, localOpMetadata);
				return;
			}
			case ContainerMessageType.FluidDataStoreOp: {
				return this.reSubmitChannelOp(type, content, localOpMetadata);
			}
			default: {
				assert(false, 0x907 /* unknown op type */);
			}
		}
	}

	protected reSubmitChannelOp(type: string, content: unknown, localOpMetadata: unknown): void {
		const envelope = content as IEnvelope;
		const context = this.contexts.get(envelope.address);
		// If the data store has been deleted, log an error and throw an error. If there are local changes for a
		// deleted data store, it can otherwise lead to inconsistent state when compared to other clients.
		if (
			this.checkAndLogIfDeleted(envelope.address, context, "Changed", "resubmitDataStoreOp")
		) {
			throw new DataCorruptionError("Context is deleted!", {
				callSite: "resubmitDataStoreOp",
				...tagCodeArtifacts({ id: envelope.address }),
			});
		}
		assert(!!context, 0x160 /* "There should be a store context for the op" */);
		const innerContents = envelope.contents as FluidDataStoreMessage;
		context.reSubmit(innerContents.type, innerContents.content, localOpMetadata);
	}

	public rollback(type: string, content: unknown, localOpMetadata: unknown): void {
		assert(type === ContainerMessageType.FluidDataStoreOp, 0x8e8 /* type */);
		const envelope = content as IEnvelope;
		const context = this.contexts.get(envelope.address);
		// If the data store has been deleted, log an error and throw an error. If there are local changes for a
		// deleted data store, it can otherwise lead to inconsistent state when compared to other clients.
		if (
			this.checkAndLogIfDeleted(envelope.address, context, "Changed", "rollbackDataStoreOp")
		) {
			throw new DataCorruptionError("Context is deleted!", {
				callSite: "rollbackDataStoreOp",
				...tagCodeArtifacts({ id: envelope.address }),
			});
		}
		assert(!!context, 0x2e8 /* "There should be a store context for the op" */);
		const innerContents = envelope.contents as FluidDataStoreMessage;
		context.rollback(innerContents.type, innerContents.content, localOpMetadata);
	}

	public async applyStashedOp(content: unknown): Promise<unknown> {
		const opContents = content as LocalContainerRuntimeMessage;
		switch (opContents.type) {
			case ContainerMessageType.Attach: {
				return this.applyStashedAttachOp(opContents.contents);
			}
			case ContainerMessageType.Alias: {
				return;
			}
			case ContainerMessageType.FluidDataStoreOp: {
				return this.applyStashedChannelChannelOp(opContents.contents);
			}
			default: {
				assert(false, 0x908 /* unknon type of op */);
			}
		}
	}

	protected async applyStashedChannelChannelOp(envelope: IEnvelope): Promise<unknown> {
		const context = this.contexts.get(envelope.address);
		// If the data store has been deleted, log an error and ignore this message. This helps prevent document
		// corruption in case the data store that stashed the op is deleted.
		if (this.checkAndLogIfDeleted(envelope.address, context, "Changed", "applyStashedOp")) {
			return undefined;
		}
		assert(!!context, 0x161 /* "There should be a store context for the op" */);
		return context.applyStashedOp(envelope.contents);
	}

	private async applyStashedAttachOp(message: IAttachMessage): Promise<void> {
		const { id, snapshot } = message;

		// build the snapshot from the summary in the attach message
		const flatAttachBlobs = new Map<string, ArrayBufferLike>();
		const snapshotTree = buildSnapshotTree(snapshot.entries, flatAttachBlobs);
		const storage = new StorageServiceWithAttachBlobs(
			this.parentContext.storage,
			flatAttachBlobs,
		);

		// create a local datastore context for the data store context,
		// which this message represents. All newly created data store
		// contexts start as a local context on the client that created
		// them, and for stashed ops, the client that applies it plays
		// the role of creating client.
		const dataStoreContext = new LocalFluidDataStoreContext({
			id,
			pkg: undefined,
			parentContext: this.wrapContextForInnerChannel(id),
			storage,
			scope: this.parentContext.scope,
			createSummarizerNodeFn: this.parentContext.getCreateChildSummarizerNodeFn(id, {
				type: CreateSummarizerNodeSource.FromSummary,
			}),
			makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(id),
			snapshotTree,
		});
		// add to the list of bound or remoted, as this context must be bound
		// to had an attach message sent, and is the non-detached case is remoted.
		this.contexts.addBoundOrRemoted(dataStoreContext);

		// realize the local context, as local contexts shouldn't be delay
		// loaded, as this client is playing the role of creating client,
		// and creating clients always create realized data store contexts.
		const channel = await dataStoreContext.realize();
		await channel.entryPoint.get();

		if (this.parentContext.attachState !== AttachState.Detached) {
			// if the client is not detached put in the pending attach list
			// so that on ack of the stashed op, the context is found.
			// detached client don't send ops, so should not expect and ack.
			this.pendingAttach.set(message.id, message);
		}
	}

	/**
	 * Process messages for this channel collection. The messages here are contiguous messages in a batch.
	 * @param messageCollection - The collection of messages to process.
	 */
	public processMessages(messageCollection: IRuntimeMessageCollection): void {
		switch (messageCollection.envelope.type) {
			case ContainerMessageType.FluidDataStoreOp: {
				this.processChannelMessages(messageCollection);
				break;
			}
			case ContainerMessageType.Attach: {
				this.processAttachMessages(messageCollection);
				break;
			}
			case ContainerMessageType.Alias: {
				this.processAliasMessages(messageCollection);
				break;
			}
			default: {
				assert(false, 0x8e9 /* unreached */);
			}
		}
	}

	/**
	 * This is still here for back-compat purposes because channel collection implements
	 * IFluidDataStoreChannel. Once it is removed from the interface, this method can be removed.
	 * Container runtime calls `processMessages` instead.
	 */
	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
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

	/**
	 * Process channel messages. The messages here are contiguous channel type messages in a batch. Bunch
	 * of contiguous messages for a data store should be sent to it together.
	 * @param messageCollection - The collection of messages to process.
	 */
	private processChannelMessages(messageCollection: IRuntimeMessageCollection): void {
		const { messagesContent, local } = messageCollection;
		let currentMessageState: { address: string; type: string } | undefined;
		let currentMessagesContent: IRuntimeMessagesContent[] = [];

		// Helper that sends the current bunch of messages to the data store. It validates that the data stores exists.
		const sendBunchedMessages = (): void => {
			// Current message state will be undefined for the first message in the list.
			if (currentMessageState === undefined) {
				return;
			}
			const currentContext = this.contexts.get(currentMessageState.address);
			assert(!!currentContext, 0xa66 /* Context not found */);

			currentContext.processMessages({
				envelope: { ...messageCollection.envelope, type: currentMessageState.type },
				messagesContent: currentMessagesContent,
				local,
			});
			currentMessagesContent = [];
		};

		/**
		 * Bunch contiguous messages for the same data store and send them together.
		 * This is an optimization mainly for DDSes, where it can process a bunch of ops together. DDSes
		 * like merge tree or shared tree can process ops more efficiently when they are bunched together.
		 */
		for (const { contents, ...restOfMessagesContent } of messagesContent) {
			const contentsEnvelope = contents as IEnvelope;
			const address = contentsEnvelope.address;
			const context = this.contexts.get(address);

			// If the data store has been deleted, log an error and ignore this message. This helps prevent document
			// corruption in case a deleted data store accidentally submitted an op.
			if (this.checkAndLogIfDeleted(address, context, "Changed", "processFluidDataStoreOp")) {
				continue;
			}

			if (context === undefined) {
				// Former assert 0x162
				throw DataProcessingError.create(
					"No context for op",
					"processFluidDataStoreOp",
					messageCollection.envelope as ISequencedDocumentMessage,
					{
						local,
						messageDetails: JSON.stringify({
							type: messageCollection.envelope.type,
							contentType: typeof contents,
						}),
						...tagCodeArtifacts({ address }),
					},
				);
			}

			const { type: contextType, content: contextContents } =
				contentsEnvelope.contents as FluidDataStoreMessage;
			// If the address or type of the message changes while processing the message, send the current bunch.
			if (
				currentMessageState?.address !== address ||
				currentMessageState?.type !== contextType
			) {
				sendBunchedMessages();
			}
			currentMessagesContent.push({
				contents: contextContents,
				...restOfMessagesContent,
			});
			currentMessageState = { address, type: contextType };

			// Notify that a GC node for the data store changed. This is used to detect if a deleted data store is
			// being used.
			this.gcNodeUpdated({
				node: { type: "DataStore", path: `/${address}` },
				reason: "Changed",
				timestampMs: messageCollection.envelope.timestamp,
				packagePath: context.isLoaded ? context.packagePath : undefined,
			});

			detectOutboundReferences(address, contextContents, (fromPath: string, toPath: string) =>
				this.parentContext.addedGCOutboundRoute(
					fromPath,
					toPath,
					messageCollection.envelope.timestamp,
				),
			);
		}

		// Process the last bunch of messages, if any. Note that there may not be any messages in case all of them are
		// ignored because the data store is deleted.
		sendBunchedMessages();
	}

	private async getDataStore(
		id: string,
		requestHeaderData: RuntimeHeaderData,
		originalRequest: IRequest,
	): Promise<IFluidDataStoreContextInternal> {
		const headerData = { ...defaultRuntimeHeaderData, ...requestHeaderData };
		if (
			this.checkAndLogIfDeleted(
				id,
				this.contexts.get(id),
				"Requested",
				"getDataStore",
				requestHeaderData,
				originalRequest,
			)
		) {
			// The requested data store has been deleted by gc. Create a 404 response exception.
			throw responseToException(
				createResponseError(404, "DataStore was deleted", originalRequest, {
					[DeletedResponseHeaderKey]: true,
				}),
				originalRequest,
			);
		}

		const context = await this.contexts.getBoundOrRemoted(id, headerData.wait);
		if (context === undefined) {
			// The requested data store does not exits. Throw a 404 response exception.
			const request: IRequest = { url: id };
			throw responseToException(create404Response(request), request);
		}
		return context;
	}

	/**
	 * Returns the data store requested with the given id if available. Otherwise, returns undefined.
	 */
	public async getDataStoreIfAvailable(
		id: string,
		requestHeaderData: RuntimeHeaderData,
	): Promise<IFluidDataStoreContextInternal | undefined> {
		// If the data store has been deleted, log an error and return undefined.
		if (
			this.checkAndLogIfDeleted(
				id,
				this.contexts.get(id),
				"Requested",
				"getDataStoreIfAvailable",
				requestHeaderData,
			)
		) {
			return undefined;
		}
		const headerData = { ...defaultRuntimeHeaderData, ...requestHeaderData };
		const context = await this.contexts.getBoundOrRemoted(id, headerData.wait);
		if (context === undefined) {
			return undefined;
		}
		return context;
	}

	/**
	 * Checks if the data store has been deleted by GC. If so, log an error.
	 * @param id - The data store's id.
	 * @param context - The data store context.
	 * @param deletedLogSuffix - Whether it was Changed or Requested (will go into the eventName)
	 * @param callSite - The function name this is called from.
	 * @param requestHeaderData - The request header information to log if the data store is deleted.
	 * @param originalRequest - The original request (could be for a child of the DataStore)
	 * @returns true if the data store is deleted. Otherwise, returns false.
	 */
	private checkAndLogIfDeleted(
		id: string,
		context: IFluidDataStoreContext | undefined,
		deletedLogSuffix: "Changed" | "Requested",
		callSite: string,
		requestHeaderData?: RuntimeHeaderData,
		originalRequest?: IRequest,
	): boolean {
		const dataStoreNodePath = `/${id}`;
		if (!this.isDataStoreDeleted(dataStoreNodePath)) {
			return false;
		}

		const idToLog =
			originalRequest !== undefined ? urlToGCNodePath(originalRequest.url) : dataStoreNodePath;

		// Log the package details asynchronously since getInitialSnapshotDetails is async
		const recentlyDeletedContext = this.contexts.getRecentlyDeletedContext(id);
		if (recentlyDeletedContext !== undefined) {
			recentlyDeletedContext
				.getInitialSnapshotDetails()
				.then((details) => {
					return details.pkg.join("/");
				})
				.then(
					(pkg) => ({ pkg, error: undefined }),
					(error: Error) => ({ pkg: undefined, error }),
				)
				.then(({ pkg, error }) => {
					this.mc.logger.sendTelemetryEvent(
						{
							eventName: `GC_DeletedDataStore_PathInfo`,
							...tagCodeArtifacts({
								id: idToLog,
								pkg,
							}),
							callSite,
						},
						error,
					);
				})
				.catch(() => {});
		}

		this.mc.logger.sendErrorEvent({
			eventName: `GC_Deleted_DataStore_${deletedLogSuffix}`,
			...tagCodeArtifacts({ id: idToLog }),
			callSite,
			headers: JSON.stringify(requestHeaderData),
			exists: context !== undefined,
			details: {
				url: originalRequest?.url,
				headers: JSON.stringify(originalRequest?.headers),
				aliased: this.aliasedDataStores.has(id),
			},
		});
		return true;
	}

	public processSignal(messageArg: IInboundSignalMessage, local: boolean): void {
		const envelope = messageArg.content as IEnvelope;
		const fluidDataStoreId = envelope.address;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const message = { ...messageArg, content: envelope.contents };
		const context = this.contexts.get(fluidDataStoreId);
		// If the data store has been deleted, log an error and ignore this message. This helps prevent document
		// corruption in case a deleted data store accidentally submitted a signal.
		if (this.checkAndLogIfDeleted(fluidDataStoreId, context, "Changed", "processSignal")) {
			return;
		}

		if (!context) {
			// Attach message may not have been processed yet
			assert(!local, 0x163 /* "Missing datastore for local signal" */);
			this.mc.logger.sendTelemetryEvent({
				eventName: "SignalFluidDataStoreNotFound",
				...tagCodeArtifacts({
					fluidDataStoreId,
				}),
			});
			return;
		}

		context.processSignal(message, local);
	}

	public setConnectionState(connected: boolean, clientId?: string): void {
		for (const [fluidDataStoreId, context] of this.contexts) {
			try {
				context.setConnectionState(connected, clientId);
			} catch (error) {
				this.mc.logger.sendErrorEvent(
					{
						eventName: "SetConnectionStateError",
						clientId,
						...tagCodeArtifacts({
							fluidDataStoreId,
						}),
						details: JSON.stringify({
							runtimeConnected: this.parentContext.connected,
							connected,
						}),
					},
					error,
				);
			}
		}
	}

	public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
		for (const [, context] of this.contexts) {
			// Fire only for bounded stores.
			if (!this.contexts.isNotBound(context.id)) {
				context.setAttachState(attachState);
			}
		}
	}

	public get size(): number {
		return this.contexts.size;
	}

	/**
	 * Create a summary. Used when attaching or serializing a detached container.
	 */
	public getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		this.visitLocalBoundContextsDuringAttach(
			(contextId: string, context: FluidDataStoreContext) => {
				let dataStoreSummary: ISummarizeResult;
				if (context.isLoaded) {
					dataStoreSummary = context.getAttachSummary(telemetryContext);
				} else {
					// If this data store is not yet loaded, then there should be no changes in the snapshot from
					// which it was created as it is detached container. So just use the previous snapshot.
					assert(
						!!this.baseSnapshot,
						0x166 /* "BaseSnapshot should be there as detached container loaded from snapshot" */,
					);
					dataStoreSummary = convertSnapshotTreeToSummaryTree(
						getSnapshotTree(this.baseSnapshot).trees[contextId],
					);
				}
				builder.addWithStats(contextId, dataStoreSummary);
			},
		);
		return builder.getSummaryTree();
	}

	/**
	 * Gets the GC data. Used when attaching or serializing a detached container.
	 */
	public getAttachGCData(telemetryContext?: ITelemetryContext): IGarbageCollectionData {
		const builder = new GCDataBuilder();
		this.visitLocalBoundContextsDuringAttach(
			(contextId: string, context: FluidDataStoreContext) => {
				const contextGCData = context.getAttachGCData(telemetryContext);
				// Prefix the child's id to the ids of its GC nodes so they can be identified as belonging to the child.
				// This also gradually builds the id of each node to be a path from the root.
				builder.prefixAndAddNodes(contextId, contextGCData.gcNodes);
			},
		);
		// Get the outbound routes (aliased data stores) and add a GC node for this channel.
		builder.addNode("/", [...this.aliasedDataStores]);
		return builder.getGCData();
	}

	/**
	 * Helper method for preparing to attach this channel.
	 * Runs the callback for each bound context to incorporate its data however the caller specifies
	 */
	private visitLocalBoundContextsDuringAttach(
		visitor: (contextId: string, context: FluidDataStoreContext) => void,
	): void {
		const visitedContexts = new Set<string>();
		let visitedLength = -1;
		let notBoundContextsLength = -1;
		while (
			visitedLength !== visitedContexts.size &&
			notBoundContextsLength !== this.contexts.notBoundLength()
		) {
			// detect changes in the visitedContexts set, as on visiting a context
			// it could could make contexts available by removing other contexts
			// from the not bound context list, so we need to ensure those get processed as well.
			// only once the loop can run with no new contexts added to the visitedContexts set do we
			// know for sure all possible contexts have been visited.
			visitedLength = visitedContexts.size;
			notBoundContextsLength = this.contexts.notBoundLength();
			for (const [contextId, context] of this.contexts) {
				if (
					!(
						visitedContexts.has(contextId) ||
						this.contexts.isNotBound(contextId) ||
						this.attachOpFiredForDataStore.has(contextId)
					)
				) {
					visitor(contextId, context);
					visitedContexts.add(contextId);
				}
			}
		}
	}

	/**
	 * Helper method for preparing to summarize this channel.
	 * Runs the callback for each bound context to incorporate its data however the caller specifies
	 */
	private async visitContextsDuringSummary(
		visitor: (contextId: string, context: FluidDataStoreContext) => Promise<void>,
		telemetryProps: ITelemetryPropertiesExt,
	): Promise<void> {
		for (const [contextId, context] of this.contexts) {
			// Summarizer client and hence GC works only with clients with no local changes. A data store in
			// attaching state indicates an op was sent to attach a local data store, and the the attach op
			// had not yet round tripped back to the client.
			// Formerly assert 0x589
			if (context.attachState === AttachState.Attaching) {
				const error = DataProcessingError.create(
					"Local data store detected in attaching state",
					"summarize/getGCData",
				);
				throw error;
			}

			if (context.attachState === AttachState.Attached) {
				// If summary / getGCData results in this data store's realization, let GC know so that it can log in
				// case the data store is not referenced. This will help identifying scenarios that we see today where
				// unreferenced data stores are being loaded.
				const contextLoadedBefore = context.isLoaded;
				const trailingOpCount = context.pendingCount;

				await visitor(contextId, context);

				if (!contextLoadedBefore && context.isLoaded) {
					this.gcNodeUpdated({
						node: { type: "DataStore", path: `/${context.id}` },
						reason: "Realized",
						packagePath: context.packagePath,
						timestampMs: undefined, // This will be added by the parent context if needed.
						additionalProps: { trailingOpCount, ...telemetryProps },
					});
				}
			}
		}
	}

	public async summarize(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		const summaryBuilder = new SummaryTreeBuilder();
		await this.visitContextsDuringSummary(
			async (contextId: string, context: FluidDataStoreContext) => {
				const contextSummary = await context.summarize(fullTree, trackState, telemetryContext);
				summaryBuilder.addWithStats(contextId, contextSummary);
			},
			{ fullTree, realizedDuring: "summarize" },
		);
		return summaryBuilder.getSummaryTree();
	}

	/**
	 * Generates data used for garbage collection. It does the following:
	 *
	 * 1. Calls into each child data store context to get its GC data.
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
			async (contextId: string, context: FluidDataStoreContext) => {
				const contextGCData = await context.getGCData(fullGC);
				// Prefix the child's id to the ids of its GC nodes so they can be identified as belonging to the child.
				// This also gradually builds the id of each node to be a path from the root.
				builder.prefixAndAddNodes(contextId, contextGCData.gcNodes);
			},
			{ fullGC, realizedDuring: "getGCData" },
		);

		// Get the outbound routes and add a GC node for this channel.
		builder.addNode("/", await this.getOutboundRoutes());
		return builder.getGCData();
	}

	/**
	 * After GC has run, called to notify this Container's data stores of routes that are used in it.
	 * @param usedRoutes - The routes that are used in all data stores in this Container.
	 */
	public updateUsedRoutes(usedRoutes: readonly string[]): void {
		// Get a map of data store ids to routes used in it.
		const usedDataStoreRoutes = unpackChildNodesUsedRoutes(usedRoutes);

		// Verify that the used routes are correct.
		for (const [id] of usedDataStoreRoutes) {
			assert(
				this.contexts.has(id),
				0x167 /* "Used route does not belong to any known data store" */,
			);
		}

		// Update the used routes in each data store. Used routes is empty for unused data stores.
		for (const [contextId, context] of this.contexts) {
			context.updateUsedRoutes(usedDataStoreRoutes.get(contextId) ?? []);
		}
	}

	public deleteChild(dataStoreId: string): void {
		const dataStoreContext = this.contexts.get(dataStoreId);
		assert(dataStoreContext !== undefined, 0x2d7 /* No data store with specified id */);

		if (dataStoreContext.isLoaded) {
			this.mc.logger.sendTelemetryEvent({
				eventName: "GC_DeletingLoadedDataStore",
				...tagCodeArtifacts({
					id: `/${dataStoreId}`, // Make the id consistent with GC node path format by prefixing a slash.
					pkg: dataStoreContext.packagePath.join("/"),
				}),
				details: {
					aliased: this.aliasedDataStores.has(dataStoreId),
				},
			});
		}

		dataStoreContext.delete();
		// Delete the contexts of unused data stores.
		this.contexts.delete(dataStoreId);
		// Delete the summarizer node of the unused data stores.
		this.parentContext.deleteChildSummarizerNode(dataStoreId);
	}

	/**
	 * Delete data stores and its objects that are sweep ready.
	 * @param sweepReadyDataStoreRoutes - The routes of data stores and its objects that are sweep ready and should
	 * be deleted.
	 * @returns The routes of data stores and its objects that were deleted.
	 */
	public deleteSweepReadyNodes(
		sweepReadyDataStoreRoutes: readonly string[],
	): readonly string[] {
		for (const route of sweepReadyDataStoreRoutes) {
			const pathParts = route.split("/");
			const dataStoreId = pathParts[1];

			// Ignore sub-data store routes because a data store and its sub-routes are deleted together, so, we only
			// need to delete the data store.
			// These routes will still be returned below as among the deleted routes
			if (pathParts.length > 2) {
				continue;
			}

			const dataStoreContext = this.contexts.get(dataStoreId);
			if (dataStoreContext === undefined) {
				// If the data store hasn't already been deleted, log an error because this should never happen.
				// If the data store has already been deleted, log a telemetry event. This can happen because multiple GC
				// sweep ops can contain the same data store. It would be interesting to track how often this happens.
				const alreadyDeleted = this.isDataStoreDeleted(`/${dataStoreId}`);
				this.mc.logger.sendTelemetryEvent({
					eventName: "DeletedDataStoreNotFound",
					category: alreadyDeleted ? "generic" : "error",
					...tagCodeArtifacts({ id: dataStoreId }),
					details: { alreadyDeleted },
				});
				continue;
			}

			this.deleteChild(dataStoreId);
		}
		return [...sweepReadyDataStoreRoutes];
	}

	/**
	 * This is called to update objects whose routes are tombstones.
	 *
	 * A Tombstoned object has been unreferenced long enough that GC knows it won't be referenced again.
	 * Tombstoned objects are eventually deleted by GC.
	 *
	 * @param tombstonedRoutes - The routes that are tombstones in all data stores in this Container.
	 */
	public updateTombstonedRoutes(tombstonedRoutes: readonly string[]): void {
		const tombstonedDataStoresSet: Set<string> = new Set();
		for (const route of tombstonedRoutes) {
			const pathParts = route.split("/");
			// Tombstone data store only if its route (/datastoreId) is directly in tombstoneRoutes.
			if (pathParts.length > 2) {
				continue;
			}
			const dataStoreId = pathParts[1];
			assert(this.contexts.has(dataStoreId), 0x510 /* No data store with specified id */);
			tombstonedDataStoresSet.add(dataStoreId);
		}

		// Update the used routes in each data store. Used routes is empty for unused data stores.
		for (const [contextId, context] of this.contexts) {
			context.setTombstone(tombstonedDataStoresSet.has(contextId));
		}
	}

	/**
	 * Returns the outbound routes of this channel. Only root data stores are considered referenced and their paths are
	 * part of outbound routes.
	 */
	private async getOutboundRoutes(): Promise<string[]> {
		const outboundRoutes: string[] = [];
		// Getting this information is a performance optimization that reduces network calls for virtualized datastores
		for (const [contextId, context] of this.contexts) {
			const isRootDataStore = await context.isRoot(this.aliasedDataStores);
			if (isRootDataStore) {
				outboundRoutes.push(`/${contextId}`);
			}
		}
		return outboundRoutes;
	}

	/**
	 * Called by GC to retrieve the package path of a data store node with the given path.
	 */
	public async getDataStorePackagePath(
		nodePath: string,
	): Promise<readonly string[] | undefined> {
		// If the node belongs to a data store, return its package path. For DDSes, we return the package path of the
		// data store that contains it.
		const context = this.contexts.get(nodePath.split("/")[1]);
		return (await context?.getInitialSnapshotDetails())?.pkg;
	}

	/**
	 * Called by GC to determine if a node is for a data store or for an object within a data store (for e.g. DDS).
	 * @returns the GC node type if the node belongs to a data store or object within data store, undefined otherwise.
	 */
	public getGCNodeType(nodePath: string): GCNodeType | undefined {
		const pathParts = nodePath.split("/");
		if (!this.contexts.has(pathParts[1])) {
			return undefined;
		}

		// Data stores paths are of the format "/dataStoreId".
		// Sub data store paths are of the format "/dataStoreId/subPath/...".
		if (pathParts.length === 2) {
			return GCNodeType.DataStore;
		}
		return GCNodeType.SubDataStore;
	}

	public internalId(maybeAlias: string): string {
		return this.aliases.get(maybeAlias) ?? maybeAlias;
	}

	public async request(request: IRequest): Promise<IResponse> {
		const requestParser = RequestParser.create(request);
		const id = requestParser.pathParts[0];

		// Differentiate between requesting the dataStore directly, or one of its children
		const requestForChild = !requestParser.isLeaf(1);

		const headerData: RuntimeHeaderData = {};
		if (typeof request.headers?.[RuntimeHeaders.wait] === "boolean") {
			headerData.wait = request.headers[RuntimeHeaders.wait];
		}
		if (typeof request.headers?.[RuntimeHeaders.viaHandle] === "boolean") {
			headerData.viaHandle = request.headers[RuntimeHeaders.viaHandle];
		}
		if (typeof request.headers?.[AllowTombstoneRequestHeaderKey] === "boolean") {
			headerData.allowTombstone = request.headers[AllowTombstoneRequestHeaderKey];
		}

		// We allow Tombstone requests for sub-DataStore objects
		if (requestForChild) {
			headerData.allowTombstone = true;
		}

		await this.waitIfPendingAlias(id);
		const internalId = this.internalId(id);
		const dataStoreContext = await this.getDataStore(internalId, headerData, request);

		// Get the initial snapshot details which contain the data store package path.
		const details = await dataStoreContext.getInitialSnapshotDetails();

		// When notifying GC of this node being loaded, we only indicate the DataStore itself, not the full subDataStore url if applicable.
		// This is in case the url is to a route that Fluid doesn't understand or track for GC (e.g. if suited for a custom request handler)
		this.gcNodeUpdated({
			node: { type: "DataStore", path: `/${id}` },
			reason: "Loaded",
			packagePath: details.pkg,
			request,
			headerData,
			timestampMs: undefined, // This will be added by the parent context if needed.
		});

		const dataStore = await dataStoreContext.realize();

		const subRequest = requestParser.createSubRequest(1);
		// We always expect createSubRequest to include a leading slash, but asserting here to protect against
		// unintentionally modifying the url if that changes.
		assert(
			subRequest.url.startsWith("/"),
			0x126 /* "Expected createSubRequest url to include a leading slash" */,
		);

		return dataStore.request(subRequest);
	}
}

export function getSummaryForDatastores(
	snapshot: ISnapshotTree | undefined,
	metadata?: IContainerRuntimeMetadata,
): ISnapshotTree | undefined {
	if (!snapshot) {
		return undefined;
	}

	if (rootHasIsolatedChannels(metadata)) {
		const datastoresSnapshot = snapshot.trees[channelsTreeName];
		assert(!!datastoresSnapshot, 0x168 /* Expected tree in snapshot not found */);
		return datastoresSnapshot;
	} else {
		// back-compat: strip out all non-datastore paths before giving to DataStores object.
		const datastoresTrees: ISnapshotTree["trees"] = {};
		for (const [key, value] of Object.entries(snapshot.trees)) {
			if (!nonDataStorePaths.includes(key)) {
				datastoresTrees[key] = value;
			}
		}
		return {
			...snapshot,
			trees: datastoresTrees,
		};
	}
}

/**
 * Traverse this op's contents and detect any outbound routes that were added by this op.
 *
 * @internal
 */
export function detectOutboundReferences(
	address: string,
	contents: unknown,
	addedOutboundReference: (fromNodePath: string, toNodePath: string) => void,
): void {
	// These will be built up as we traverse the envelope contents
	const outboundPaths: string[] = [];
	let ddsAddress: string | undefined;

	function recursivelyFindHandles(obj: unknown): void {
		if (typeof obj === "object" && obj !== null) {
			for (const [key, value] of Object.entries(obj)) {
				// If 'value' is a serialized IFluidHandle, it represents a new outbound route.
				if (isSerializedHandle(value)) {
					outboundPaths.push(value.url);
				}

				// NOTE: This is taking a hard dependency on the fact that in our DataStore implementation,
				// the address of the DDS is stored in a property called "address".  This is not ideal.
				// An alternative would be for the op envelope to include the absolute path (built up as it is submitted)
				if (key === "address" && ddsAddress === undefined) {
					ddsAddress = value as string | undefined;
				}

				recursivelyFindHandles(value);
			}
		}
	}

	recursivelyFindHandles(contents);

	// GC node paths are all absolute paths, hence the "" prefix.
	// e.g. this will yield "/dataStoreId/ddsId"
	const fromPath = ["", address, ddsAddress].join("/");
	for (const toPath of outboundPaths) {
		addedOutboundReference(fromPath, toPath);
	}
}

/**
 * @internal
 */
export class ChannelCollectionFactory<T extends ChannelCollection = ChannelCollection>
	implements IFluidDataStoreFactory
{
	public readonly type = "ChannelCollectionChannel";

	public IFluidDataStoreRegistry: IFluidDataStoreRegistry;

	constructor(
		registryEntries: NamedFluidDataStoreRegistryEntries,
		// ADO:7302 We need a better type here
		private readonly provideEntryPoint: (
			runtime: IFluidDataStoreChannel,
		) => Promise<FluidObject>,
		private readonly ctor: (...args: ConstructorParameters<typeof ChannelCollection>) => T,
	) {
		this.IFluidDataStoreRegistry = new FluidDataStoreRegistry(registryEntries);
	}

	public get IFluidDataStoreFactory(): ChannelCollectionFactory<T> {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		_existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime = this.ctor(
			context.baseSnapshot,
			context, // parentContext
			context.baseLogger,
			() => {}, // gcNodeUpdated
			(_nodePath: string) => false, // isDataStoreDeleted
			new Map(), // aliasMap
			this.provideEntryPoint,
		);

		return runtime;
	}
}

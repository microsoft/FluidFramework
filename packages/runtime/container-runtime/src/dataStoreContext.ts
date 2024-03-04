/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDisposable,
	FluidObject,
	IRequest,
	IResponse,
	IFluidHandle,
	ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import { IAudience, IDeltaManager, AttachState } from "@fluidframework/container-definitions";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert, Deferred, LazyPromise } from "@fluidframework/core-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobTreeEntry, readAndParse } from "@fluidframework/driver-utils";
import {
	IClientDetails,
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISnapshotTree,
	ITreeEntry,
} from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
	channelsTreeName,
	CreateChildSummarizerNodeFn,
	CreateChildSummarizerNodeParam,
	FluidDataStoreRegistryEntry,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreContextDetached,
	IFluidDataStoreContextEvents,
	IFluidDataStoreRegistry,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
	IInboundSignalMessage,
	IProvideFluidDataStoreFactory,
	ISummarizeInternalResult,
	ISummarizeResult,
	ISummarizerNodeWithGC,
	SummarizeInternalFn,
	ITelemetryContext,
	VisibilityState,
	ISummaryTreeWithStats,
	IDataStore,
} from "@fluidframework/runtime-definitions";
import { addBlobToSummary } from "@fluidframework/runtime-utils";
import {
	createChildMonitoringContext,
	DataCorruptionError,
	DataProcessingError,
	extractSafePropertiesFromMessage,
	generateStack,
	ITelemetryLoggerExt,
	LoggingError,
	MonitoringContext,
	tagCodeArtifacts,
	ThresholdCounter,
} from "@fluidframework/telemetry-utils";
import { IIdCompressor, IIdCompressorCore } from "@fluidframework/id-compressor";
import {
	dataStoreAttributesBlobName,
	hasIsolatedChannels,
	wrapSummaryInChannelsTree,
	ReadFluidDataStoreAttributes,
	WriteFluidDataStoreAttributes,
	getAttributesFormatVersion,
	getFluidDataStoreAttributes,
	summarizerClientType,
} from "./summary/index.js";
import { ContainerRuntime } from "./containerRuntime.js";
import { detectOutboundRoutesViaDDSKey, sendGCUnexpectedUsageEvent } from "./gc/index.js";

function createAttributes(
	pkg: readonly string[],
	isRootDataStore: boolean,
): WriteFluidDataStoreAttributes {
	const stringifiedPkg = JSON.stringify(pkg);
	return {
		pkg: stringifiedPkg,
		summaryFormatVersion: 2,
		isRootDataStore,
	};
}
export function createAttributesBlob(pkg: readonly string[], isRootDataStore: boolean): ITreeEntry {
	const attributes = createAttributes(pkg, isRootDataStore);
	return new BlobTreeEntry(dataStoreAttributesBlobName, JSON.stringify(attributes));
}

interface ISnapshotDetails {
	pkg: readonly string[];
	isRootDataStore: boolean;
	snapshot?: ISnapshotTree;
	sequenceNumber?: number;
}

interface FluidDataStoreMessage {
	content: any;
	type: string;
}

/** Properties necessary for creating a FluidDataStoreContext */
export interface IFluidDataStoreContextProps {
	readonly id: string;
	readonly runtime: ContainerRuntime;
	readonly storage: IDocumentStorageService;
	readonly scope: FluidObject;
	readonly createSummarizerNodeFn: CreateChildSummarizerNodeFn;
	readonly pkg?: Readonly<string[]>;
	readonly loadingGroupId?: string;
}

/** Properties necessary for creating a local FluidDataStoreContext */
export interface ILocalFluidDataStoreContextProps extends IFluidDataStoreContextProps {
	readonly pkg: Readonly<string[]> | undefined;
	readonly snapshotTree: ISnapshotTree | undefined;
	readonly isRootDataStore: boolean | undefined;
	readonly makeLocallyVisibleFn: () => void;
	/**
	 * @deprecated 0.16 Issue #1635, #3631
	 */
	readonly createProps?: any;
}

/** Properties necessary for creating a local FluidDataStoreContext */
export interface ILocalDetachedFluidDataStoreContextProps extends ILocalFluidDataStoreContextProps {
	readonly channelToDataStoreFn: (channel: IFluidDataStoreChannel, id: string) => IDataStore;
}

/** Properties necessary for creating a remote FluidDataStoreContext */
export interface IRemoteFluidDataStoreContextProps extends IFluidDataStoreContextProps {
	readonly snapshotTree: ISnapshotTree | undefined;
}

/**
 * Represents the context for the store. This context is passed to the store runtime.
 */
export abstract class FluidDataStoreContext
	extends TypedEventEmitter<IFluidDataStoreContextEvents>
	implements IFluidDataStoreContext, IDisposable
{
	public get packagePath(): readonly string[] {
		assert(this.pkg !== undefined, 0x139 /* "Undefined package path" */);
		return this.pkg;
	}

	public get options(): Record<string | number, any> {
		return this._containerRuntime.options;
	}

	public get clientId(): string | undefined {
		return this._containerRuntime.clientId;
	}

	public get clientDetails(): IClientDetails {
		return this._containerRuntime.clientDetails;
	}

	public get logger(): ITelemetryLoggerExt {
		return this._containerRuntime.logger;
	}

	public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
		return this._containerRuntime.deltaManager;
	}

	public get connected(): boolean {
		return this._containerRuntime.connected;
	}

	public get IFluidHandleContext() {
		return this._containerRuntime.IFluidHandleContext;
	}

	public get containerRuntime(): IContainerRuntime {
		return this._containerRuntime;
	}

	public ensureNoDataModelChanges<T>(callback: () => T): T {
		return this._containerRuntime.ensureNoDataModelChanges(callback);
	}

	public get isLoaded(): boolean {
		return this.loaded;
	}

	public get baseSnapshot(): ISnapshotTree | undefined {
		return this._baseSnapshot;
	}

	public get idCompressor(): (IIdCompressorCore & IIdCompressor) | undefined {
		return this._containerRuntime.idCompressor;
	}

	private _disposed = false;
	public get disposed() {
		return this._disposed;
	}

	/**
	 * A Tombstoned object has been unreferenced long enough that GC knows it won't be referenced again.
	 * Tombstoned objects are eventually deleted by GC.
	 */
	private _tombstoned = false;
	public get tombstoned() {
		return this._tombstoned;
	}
	/** If true, throw an error when a tombstone data store is used. */
	private readonly throwOnTombstoneUsage: boolean;

	/** If true, this means that this data store context and its children have been removed from the runtime */
	private deleted: boolean = false;

	public get attachState(): AttachState {
		return this._attachState;
	}

	public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry | undefined {
		return this.registry;
	}

	private baseSnapshotSequenceNumber: number | undefined;

	/**
	 * A datastore is considered as root if it
	 * 1. is root in memory - see isInMemoryRoot
	 * 2. is root as part of the base snapshot that the datastore loaded from
	 * @returns whether a datastore is root
	 */
	public async isRoot(): Promise<boolean> {
		return this.isInMemoryRoot() || (await this.getInitialSnapshotDetails()).isRootDataStore;
	}

	/**
	 * There are 3 states where isInMemoryRoot needs to be true
	 * 1. when a datastore becomes aliased. This can happen for both remote and local datastores
	 * 2. when a datastore is created locally as root
	 * 3. when a datastore is created locally as root and is rehydrated
	 * @returns whether a datastore is root in memory
	 */
	protected isInMemoryRoot(): boolean {
		return this._isInMemoryRoot;
	}

	protected registry: IFluidDataStoreRegistry | undefined;

	protected detachedRuntimeCreation = false;
	protected channel: IFluidDataStoreChannel | undefined;
	private loaded = false;
	protected pending: ISequencedDocumentMessage[] | undefined = [];
	protected channelDeferred: Deferred<IFluidDataStoreChannel> | undefined;
	protected _baseSnapshot: ISnapshotTree | undefined;
	protected _attachState: AttachState;
	private _isInMemoryRoot: boolean = false;
	protected readonly summarizerNode: ISummarizerNodeWithGC;
	protected readonly mc: MonitoringContext;
	private readonly thresholdOpsCounter: ThresholdCounter;
	private static readonly pendingOpsCountThreshold = 1000;

	/**
	 * If the summarizer makes local changes, a telemetry event is logged. This has the potential to be very noisy.
	 * So, adding a count of how many telemetry events are logged per data store context. This can be
	 * controlled via feature flags.
	 */
	private localChangesTelemetryCount: number;

	// The used routes of this node as per the last GC run. This is used to update the used routes of the channel
	// if it realizes after GC is run.
	private lastUsedRoutes: string[] | undefined;

	public readonly id: string;
	private readonly _containerRuntime: ContainerRuntime;
	public readonly storage: IDocumentStorageService;
	public readonly scope: FluidObject;
	// Represents the group to which the data store belongs too.
	public readonly loadingGroupId: string | undefined;
	protected pkg?: readonly string[];

	constructor(
		props: IFluidDataStoreContextProps,
		private readonly existing: boolean,
		public readonly isLocalDataStore: boolean,
		private readonly makeLocallyVisibleFn: () => void,
	) {
		super();

		this._containerRuntime = props.runtime;
		this.id = props.id;
		this.storage = props.storage;
		this.scope = props.scope;
		this.pkg = props.pkg;
		this.loadingGroupId = props.loadingGroupId;

		// URIs use slashes as delimiters. Handles use URIs.
		// Thus having slashes in types almost guarantees trouble down the road!
		assert(!this.id.includes("/"), 0x13a /* Data store ID contains slash */);

		this._attachState =
			this.containerRuntime.attachState !== AttachState.Detached && this.existing
				? this.containerRuntime.attachState
				: AttachState.Detached;

		const thisSummarizeInternal = async (
			fullTree: boolean,
			trackState: boolean,
			telemetryContext?: ITelemetryContext,
		) => this.summarizeInternal(fullTree, trackState, telemetryContext);

		this.summarizerNode = props.createSummarizerNodeFn(
			thisSummarizeInternal,
			async (fullGC?: boolean) => this.getGCDataInternal(fullGC),
		);

		this.mc = createChildMonitoringContext({
			logger: this.logger,
			namespace: "FluidDataStoreContext",
			properties: {
				all: tagCodeArtifacts({
					fluidDataStoreId: this.id,
					// The package name is a getter because `this.pkg` may not be initialized during construction.
					// For data stores loaded from summary, it is initialized during data store realization.
					fullPackageName: () => this.pkg?.join("/"),
				}),
			},
		});
		this.thresholdOpsCounter = new ThresholdCounter(
			FluidDataStoreContext.pendingOpsCountThreshold,
			this.mc.logger,
		);

		this.throwOnTombstoneUsage = this._containerRuntime.gcThrowOnTombstoneUsage;

		// By default, a data store can log maximum 10 local changes telemetry in summarizer.
		this.localChangesTelemetryCount =
			this.mc.config.getNumber("Fluid.Telemetry.LocalChangesTelemetryCount") ?? 10;
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		// Dispose any pending runtime after it gets fulfilled
		// Errors are logged where this.channelDeferred is consumed/generated (realizeCore(), bindRuntime())
		if (this.channelDeferred) {
			this.channelDeferred.promise
				.then((runtime) => {
					runtime.dispose();
				})
				.catch((error) => {});
		}
	}

	/**
	 * When delete is called, that means that the data store is permanently removed from the runtime, and will not show up in future summaries
	 * This function is called to prevent ops from being generated from this data store once it has been deleted. Furthermore, this data store
	 * should not receive any ops/signals.
	 */
	public delete() {
		this.deleted = true;
	}

	public setTombstone(tombstone: boolean) {
		if (this.tombstoned === tombstone) {
			return;
		}

		this._tombstoned = tombstone;
	}

	private rejectDeferredRealize(
		reason: string,
		failedPkgPath?: string,
		fullPackageName?: readonly string[],
	): never {
		throw new LoggingError(
			reason,
			tagCodeArtifacts({
				failedPkgPath,
				packagePath: fullPackageName?.join("/"),
			}),
		);
	}

	public async realize(): Promise<IFluidDataStoreChannel> {
		assert(!this.detachedRuntimeCreation, 0x13d /* "Detached runtime creation on realize()" */);
		if (!this.channelDeferred) {
			this.channelDeferred = new Deferred<IFluidDataStoreChannel>();
			this.realizeCore(this.existing).catch((error) => {
				const errorWrapped = DataProcessingError.wrapIfUnrecognized(
					error,
					"realizeFluidDataStoreContext",
				);
				errorWrapped.addTelemetryProperties(
					tagCodeArtifacts({
						fullPackageName: this.pkg?.join("/"),
						fluidDataStoreId: this.id,
					}),
				);
				this.channelDeferred?.reject(errorWrapped);
				this.mc.logger.sendErrorEvent({ eventName: "RealizeError" }, errorWrapped);
			});
		}
		return this.channelDeferred.promise;
	}

	protected async factoryFromPackagePath(packages?: readonly string[]) {
		assert(this.pkg === packages, 0x13e /* "Unexpected package path" */);
		if (packages === undefined) {
			this.rejectDeferredRealize("packages is undefined");
		}

		let entry: FluidDataStoreRegistryEntry | undefined;
		let registry: IFluidDataStoreRegistry | undefined =
			this._containerRuntime.IFluidDataStoreRegistry;
		let lastPkg: string | undefined;
		for (const pkg of packages) {
			if (!registry) {
				this.rejectDeferredRealize("No registry for package", lastPkg, packages);
			}
			lastPkg = pkg;
			entry = await registry.get(pkg);
			if (!entry) {
				this.rejectDeferredRealize(
					"Registry does not contain entry for the package",
					pkg,
					packages,
				);
			}
			registry = entry.IFluidDataStoreRegistry;
		}
		const factory = entry?.IFluidDataStoreFactory;
		if (factory === undefined) {
			this.rejectDeferredRealize("Can't find factory for package", lastPkg, packages);
		}

		return { factory, registry };
	}

	private async realizeCore(existing: boolean): Promise<void> {
		const details = await this.getInitialSnapshotDetails();
		// Base snapshot is the baseline where pending ops are applied to.
		// It is important that this be in sync with the pending ops, and also
		// that it is set here, before bindRuntime is called.
		this._baseSnapshot = details.snapshot;
		this.baseSnapshotSequenceNumber = details.sequenceNumber;
		const packages = details.pkg;

		const { factory, registry } = await this.factoryFromPackagePath(packages);

		assert(
			this.registry === undefined,
			0x13f /* "datastore context registry is already set" */,
		);
		this.registry = registry;

		const channel = await factory.instantiateDataStore(this, existing);
		assert(channel !== undefined, 0x140 /* "undefined channel on datastore context" */);
		this.bindRuntime(channel);
		// This data store may have been disposed before the channel is created during realization. If so,
		// dispose the channel now.
		if (this.disposed) {
			channel.dispose();
		}
	}

	/**
	 * Notifies this object about changes in the connection state.
	 * @param value - New connection state.
	 * @param clientId - ID of the client. Its old ID when in disconnected state and
	 * its new client ID when we are connecting or connected.
	 */
	public setConnectionState(connected: boolean, clientId?: string) {
		// ConnectionState should not fail in tombstone mode as this is internally run
		this.verifyNotClosed("setConnectionState", false /* checkTombstone */);

		// Connection events are ignored if the store is not yet loaded
		if (!this.loaded) {
			return;
		}

		assert(this.connected === connected, 0x141 /* "Unexpected connected state" */);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.channel!.setConnectionState(connected, clientId);
	}

	public process(
		messageArg: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		const safeTelemetryProps = extractSafePropertiesFromMessage(messageArg);
		// On op process, tombstone error is logged in garbage collector. So, set "checkTombstone" to false when calling
		// "verifyNotClosed" which logs tombstone errors. Throw error if tombstoned and throwing on load is configured.
		this.verifyNotClosed("process", false /* checkTombstone */, safeTelemetryProps);
		if (this.tombstoned && this.throwOnTombstoneUsage) {
			throw new DataCorruptionError(
				"Context is tombstoned! Call site [process]",
				safeTelemetryProps,
			);
		}

		const innerContents = messageArg.contents as FluidDataStoreMessage;
		const message = {
			...messageArg,
			type: innerContents.type,
			contents: innerContents.content,
		};

		this.summarizerNode.recordChange(message);

		if (this.loaded) {
			return this.channel?.process(message, local, localOpMetadata);
		} else {
			assert(!local, 0x142 /* "local store channel is not loaded" */);
			assert(this.pending !== undefined, 0x23d /* "pending is undefined" */);
			this.pending.push(message);
			this.thresholdOpsCounter.sendIfMultiple("StorePendingOps", this.pending.length);
		}
	}

	public processSignal(message: IInboundSignalMessage, local: boolean): void {
		this.verifyNotClosed("processSignal");

		// Signals are ignored if the store is not yet loaded
		if (!this.loaded) {
			return;
		}

		this.channel?.processSignal(message, local);
	}

	public getQuorum(): IQuorumClients {
		return this._containerRuntime.getQuorum();
	}

	public getAudience(): IAudience {
		return this._containerRuntime.getAudience();
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
	): Promise<ISummarizeResult> {
		return this.summarizerNode.summarize(fullTree, trackState, telemetryContext);
	}

	private async summarizeInternal(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummarizeInternalResult> {
		await this.realize();

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const summarizeResult = await this.channel!.summarize(
			fullTree,
			trackState,
			telemetryContext,
		);

		// Wrap dds summaries in .channels subtree.
		wrapSummaryInChannelsTree(summarizeResult);
		const pathPartsForChildren = [channelsTreeName];

		// Add data store's attributes to the summary.
		const { pkg } = await this.getInitialSnapshotDetails();
		const isRoot = await this.isRoot();
		const attributes = createAttributes(pkg, isRoot);
		addBlobToSummary(summarizeResult, dataStoreAttributesBlobName, JSON.stringify(attributes));

		// If we are not referenced, mark the summary tree as unreferenced. Also, update unreferenced blob
		// size in the summary stats with the blobs size of this data store.
		if (!this.summarizerNode.isReferenced()) {
			summarizeResult.summary.unreferenced = true;
			summarizeResult.stats.unreferencedBlobSize = summarizeResult.stats.totalBlobSize;
		}

		// Add loadingGroupId to the summary
		if (this.loadingGroupId !== undefined) {
			summarizeResult.summary.groupId = this.loadingGroupId;
		}

		return {
			...summarizeResult,
			id: this.id,
			pathPartsForChildren,
		};
	}

	/**
	 * Returns the data used for garbage collection. This includes a list of GC nodes that represent this data store
	 * including any of its child channel contexts. Each node has a set of outbound routes to other GC nodes in the
	 * document.
	 * If there is no new data in this data store since the last summary, previous GC data is used.
	 * If there is new data, the GC data is generated again (by calling getGCDataInternal).
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		return this.summarizerNode.getGCData(fullGC);
	}

	/**
	 * Generates data used for garbage collection. This is called when there is new data since last summary. It
	 * realizes the data store and calls into each channel context to get its GC data.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	private async getGCDataInternal(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		await this.realize();
		assert(
			this.channel !== undefined,
			0x143 /* "Channel should not be undefined when running GC" */,
		);

		return this.channel.getGCData(fullGC);
	}

	/**
	 * After GC has run, called to notify the data store of routes used in it. These are used for the following:
	 *
	 * 1. To identify if this data store is being referenced in the document or not.
	 *
	 * 2. To determine if it needs to re-summarize in case used routes changed since last summary.
	 *
	 * 3. These are added to the summary generated by the data store.
	 *
	 * 4. To notify child contexts of their used routes. This is done immediately if the data store is loaded.
	 * Else, it is done when realizing the data store.
	 *
	 * 5. To update the timestamp when this data store or any children are marked as unreferenced.
	 *
	 * @param usedRoutes - The routes that are used in this data store.
	 */
	public updateUsedRoutes(usedRoutes: string[]) {
		// Update the used routes in this data store's summarizer node.
		this.summarizerNode.updateUsedRoutes(usedRoutes);

		/**
		 * Store the used routes to update the channel if the data store is not loaded yet. If the used routes changed
		 * since the previous run, the data store will be loaded during summarize since the used state changed. So, it's
		 * safe to only store the last used routes.
		 */
		this.lastUsedRoutes = usedRoutes;

		// If we are loaded, call the channel so it can update the used routes of the child contexts.
		// If we are not loaded, we will update this when we are realized.
		if (this.loaded) {
			this.updateChannelUsedRoutes();
		}
	}

	/**
	 * @deprecated There is no replacement for this, its functionality is no longer needed at this layer.
	 * It will be removed in a future release, sometime after 2.0.0-internal.8.0.0
	 *
	 * Similar capability is exposed with from/to string paths instead of handles via @see addedGCOutboundRoute
	 *
	 * Called when a new outbound reference is added to another node. This is used by garbage collection to identify
	 * all references added in the system.
	 * @param srcHandle - The handle of the node that added the reference.
	 * @param outboundHandle - The handle of the outbound node that is referenced.
	 */
	public addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle) {
		// By default, skip this call since the ContainerRuntime will detect the outbound route directly.
		if (this.mc.config.getBoolean(detectOutboundRoutesViaDDSKey) === true) {
			// Note: The ContainerRuntime code will check this same setting to avoid double counting.
			this._containerRuntime.addedGCOutboundReference(srcHandle, outboundHandle);
		}
	}

	/**
	 * (Same as @see addedGCOutboundReference, but with string paths instead of handles)
	 *
	 * Called when a new outbound reference is added to another node. This is used by garbage collection to identify
	 * all references added in the system.
	 *
	 * @param fromPath - The absolute path of the node that added the reference.
	 * @param toPath - The absolute path of the outbound node that is referenced.
	 */
	public addedGCOutboundRoute(fromPath: string, toPath: string) {
		this._containerRuntime.addedGCOutboundReference(
			{ absolutePath: fromPath },
			{ absolutePath: toPath },
		);
	}

	/**
	 * Updates the used routes of the channel and its child contexts. The channel must be loaded before calling this.
	 * It is called in these two scenarios:
	 * 1. When the used routes of the data store is updated and the data store is loaded.
	 * 2. When the data store is realized. This updates the channel's used routes as per last GC run.
	 */
	private updateChannelUsedRoutes() {
		assert(this.loaded, 0x144 /* "Channel should be loaded when updating used routes" */);
		assert(
			this.channel !== undefined,
			0x145 /* "Channel should be present when data store is loaded" */,
		);

		// If there is no lastUsedRoutes, GC has not run up until this point.
		if (this.lastUsedRoutes === undefined) {
			return;
		}

		// Remove the route to this data store, if it exists.
		const usedChannelRoutes = this.lastUsedRoutes.filter((id: string) => {
			return id !== "/" && id !== "";
		});
		this.channel.updateUsedRoutes(usedChannelRoutes);
	}

	/**
	 * @deprecated 0.18.Should call request on the runtime directly
	 */
	public async request(request: IRequest): Promise<IResponse> {
		const runtime = await this.realize();
		return runtime.request(request);
	}

	public submitMessage(type: string, content: any, localOpMetadata: unknown): void {
		this.verifyNotClosed("submitMessage");
		assert(!!this.channel, 0x146 /* "Channel must exist when submitting message" */);
		const fluidDataStoreContent: FluidDataStoreMessage = {
			content,
			type,
		};

		// Summarizer clients should not submit messages.
		this.identifyLocalChangeInSummarizer("DataStoreMessageSubmittedInSummarizer", type);

		this._containerRuntime.submitDataStoreOp(this.id, fluidDataStoreContent, localOpMetadata);
	}

	/**
	 * This is called from a SharedSummaryBlock that does not generate ops but only wants to be part of the summary.
	 * It indicates that there is data in the object that needs to be summarized.
	 * We will update the latestSequenceNumber of the summary tracker of this
	 * store and of the object's channel.
	 *
	 * @param address - The address of the channel that is dirty.
	 *
	 */
	public setChannelDirty(address: string): void {
		this.verifyNotClosed("setChannelDirty");

		// Get the latest sequence number.
		const latestSequenceNumber = this.deltaManager.lastSequenceNumber;

		this.summarizerNode.invalidate(latestSequenceNumber);

		const channelSummarizerNode = this.summarizerNode.getChild(address);

		if (channelSummarizerNode) {
			channelSummarizerNode.invalidate(latestSequenceNumber); // TODO: lazy load problem?
		}
	}

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	public submitSignal(type: string, content: any, targetClientId?: string) {
		this.verifyNotClosed("submitSignal");

		assert(!!this.channel, 0x147 /* "Channel must exist on submitting signal" */);
		return this._containerRuntime.submitDataStoreSignal(this.id, type, content, targetClientId);
	}

	/**
	 * This is called by the data store channel when it becomes locally visible indicating that it is ready to become
	 * globally visible now.
	 */
	public makeLocallyVisible() {
		assert(this.channel !== undefined, 0x2cf /* "undefined channel on datastore context" */);
		assert(
			this.channel.visibilityState === VisibilityState.LocallyVisible,
			0x590 /* Channel must be locally visible */,
		);
		this.makeLocallyVisibleFn();
	}

	protected bindRuntime(channel: IFluidDataStoreChannel) {
		if (this.channel) {
			throw new Error("Runtime already bound");
		}

		try {
			assert(
				!this.detachedRuntimeCreation,
				0x148 /* "Detached runtime creation on runtime bind" */,
			);
			assert(this.channelDeferred !== undefined, 0x149 /* "Undefined channel deferral" */);
			assert(this.pkg !== undefined, 0x14a /* "Undefined package path" */);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const pending = this.pending!;

			// Apply all pending ops
			for (const op of pending) {
				// Only process ops whose seq number is greater than snapshot sequence number from which it loaded.
				const seqNumber = this.baseSnapshotSequenceNumber ?? -1;
				if (op.sequenceNumber > seqNumber) {
					channel.process(op, false, undefined /* localOpMetadata */);
				}
			}

			this.thresholdOpsCounter.send("ProcessPendingOps", pending.length);
			this.pending = undefined;

			// And now mark the runtime active
			this.loaded = true;
			this.channel = channel;

			// Freeze the package path to ensure that someone doesn't modify it when it is
			// returned in packagePath().
			Object.freeze(this.pkg);

			/**
			 * Update the used routes of the channel. If GC has run before this data store was realized, we will have
			 * the used routes saved. So, this will ensure that all the child contexts have up-to-date used routes as
			 * per the last time GC was run.
			 * Also, this data store may have been realized during summarize. In that case, the child contexts need to
			 * have their used routes updated to determine if its needs to summarize again and to add it to the summary.
			 */
			this.updateChannelUsedRoutes();

			// And notify the pending promise it is now available
			this.channelDeferred.resolve(this.channel);
		} catch (error) {
			this.channelDeferred?.reject(error);
			this.mc.logger.sendErrorEvent(
				{
					eventName: "BindRuntimeError",
				},
				error,
			);
		}
	}

	public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
		if (this.attachState !== AttachState.Attached) {
			return undefined;
		}
		return this._containerRuntime.getAbsoluteUrl(relativeUrl);
	}

	/**
	 * Get the data required when attaching this context's DataStore.
	 * Used for both Container Attach and DataStore Attach.
	 *
	 * @returns the summary, type, and GC Data for this context's DataStore.
	 */
	public abstract getAttachData(
		includeGCData: boolean,
		telemetryContext?: ITelemetryContext,
	): {
		attachSummary: ISummaryTreeWithStats;
		type: string;
		gcData?: IGarbageCollectionData;
	};

	public abstract getInitialSnapshotDetails(): Promise<ISnapshotDetails>;

	/**
	 * @deprecated Sets the datastore as root, for aliasing purposes: #7948
	 * This method should not be used outside of the aliasing context.
	 * It will be removed, as the source of truth for this flag will be the aliasing blob.
	 */
	public setInMemoryRoot(): void {
		this._isInMemoryRoot = true;
	}

	/**
	 * @deprecated The functionality to get base GC details has been moved to summarizer node.
	 */
	public async getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase> {
		return {};
	}

	public reSubmit(contents: any, localOpMetadata: unknown) {
		assert(!!this.channel, 0x14b /* "Channel must exist when resubmitting ops" */);
		const innerContents = contents as FluidDataStoreMessage;
		this.channel.reSubmit(innerContents.type, innerContents.content, localOpMetadata);
	}

	public rollback(contents: any, localOpMetadata: unknown) {
		if (!this.channel) {
			throw new Error("Channel must exist when rolling back ops");
		}
		if (!this.channel.rollback) {
			throw new Error("Channel doesn't support rollback");
		}
		const innerContents = contents as FluidDataStoreMessage;
		this.channel.rollback(innerContents.type, innerContents.content, localOpMetadata);
	}

	public async applyStashedOp(contents: any): Promise<unknown> {
		if (!this.channel) {
			await this.realize();
		}
		assert(!!this.channel, 0x14c /* "Channel must exist when rebasing ops" */);
		return this.channel.applyStashedOp(contents);
	}

	private verifyNotClosed(
		callSite: string,
		checkTombstone = true,
		safeTelemetryProps: ITelemetryBaseProperties = {},
	) {
		if (this.deleted) {
			const messageString = `Context is deleted! Call site [${callSite}]`;
			const error = new DataCorruptionError(messageString, safeTelemetryProps);
			this.mc.logger.sendErrorEvent(
				{
					eventName: "GC_Deleted_DataStore_Changed",
					callSite,
				},
				error,
			);

			throw error;
		}

		if (this._disposed) {
			throw new Error(`Context is closed! Call site [${callSite}]`);
		}

		if (checkTombstone && this.tombstoned) {
			const messageString = `Context is tombstoned! Call site [${callSite}]`;
			const error = new DataCorruptionError(messageString, safeTelemetryProps);

			sendGCUnexpectedUsageEvent(
				this.mc,
				{
					eventName: "GC_Tombstone_DataStore_Changed",
					category: this.throwOnTombstoneUsage ? "error" : "generic",
					gcTombstoneEnforcementAllowed:
						this._containerRuntime.gcTombstoneEnforcementAllowed,
					callSite,
				},
				this.pkg,
				error,
			);
			if (this.throwOnTombstoneUsage) {
				throw error;
			}
		}
	}

	/**
	 * Summarizer client should not have local changes. These changes can become part of the summary and can break
	 * eventual consistency. For example, the next summary (say at ref seq# 100) may contain these changes whereas
	 * other clients that are up-to-date till seq# 100 may not have them yet.
	 */
	protected identifyLocalChangeInSummarizer(eventName: string, type?: string) {
		if (
			this.clientDetails.type !== summarizerClientType ||
			this.localChangesTelemetryCount <= 0
		) {
			return;
		}

		// Log a telemetry if there are local changes in the summarizer. This will give us data on how often
		// this is happening and which data stores do this. The eventual goal is to disallow local changes
		// in the summarizer and the data will help us plan this.
		this.mc.logger.sendTelemetryEvent({
			eventName,
			type,
			isSummaryInProgress: this.summarizerNode.isSummaryInProgress?.(),
			stack: generateStack(),
		});
		this.localChangesTelemetryCount--;
	}

	public getCreateChildSummarizerNodeFn(id: string, createParam: CreateChildSummarizerNodeParam) {
		return (
			summarizeInternal: SummarizeInternalFn,
			getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
		) =>
			this.summarizerNode.createChild(
				summarizeInternal,
				id,
				createParam,
				undefined /* config */,
				getGCDataFn,
			);
	}

	public async uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		return this.containerRuntime.uploadBlob(blob, signal);
	}
}

export class RemoteFluidDataStoreContext extends FluidDataStoreContext {
	// Tells whether we need to fetch the snapshot before use. This is to support Data Virtualization.
	private snapshotFetchRequired: boolean;
	private readonly runtime: ContainerRuntime;

	constructor(props: IRemoteFluidDataStoreContextProps) {
		super(props, true /* existing */, false /* isLocalDataStore */, () => {
			throw new Error("Already attached");
		});

		this._baseSnapshot = props.snapshotTree;
		this.snapshotFetchRequired = !!props.snapshotTree?.omitted;
		this.runtime = props.runtime;
		if (props.snapshotTree !== undefined) {
			this.summarizerNode.updateBaseSummaryState(props.snapshotTree);
		}
	}

	private readonly initialSnapshotDetailsP = new LazyPromise<ISnapshotDetails>(async () => {
		// Sequence number of the snapshot.
		let sequenceNumber: number | undefined;
		if (this.snapshotFetchRequired) {
			assert(
				this.loadingGroupId !== undefined,
				"groupId should be present to fetch snapshot",
			);
			const snapshot = await this.runtime.getSnapshotForLoadingGroupId(
				[this.loadingGroupId],
				[this.id],
			);
			this._baseSnapshot = snapshot.snapshotTree;
			sequenceNumber = snapshot.sequenceNumber;
			this.snapshotFetchRequired = false;
		}
		let tree = this.baseSnapshot;
		let isRootDataStore = true;

		if (!!tree && tree.blobs[dataStoreAttributesBlobName] !== undefined) {
			// Need to get through snapshot and use that to populate extraBlobs
			const attributes = await readAndParse<ReadFluidDataStoreAttributes>(
				this.storage,
				tree.blobs[dataStoreAttributesBlobName],
			);

			let pkgFromSnapshot: string[];
			// Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
			// For snapshotFormatVersion = "0.1" (1) or above, pkg is jsonified, otherwise it is just a string.
			const formatVersion = getAttributesFormatVersion(attributes);
			if (formatVersion < 1) {
				pkgFromSnapshot =
					attributes.pkg.startsWith('["') && attributes.pkg.endsWith('"]')
						? (JSON.parse(attributes.pkg) as string[])
						: [attributes.pkg];
			} else {
				pkgFromSnapshot = JSON.parse(attributes.pkg) as string[];
			}
			this.pkg = pkgFromSnapshot;

			/**
			 * If there is no isRootDataStore in the attributes blob, set it to true. This will ensure that
			 * data stores in older documents are not garbage collected incorrectly. This may lead to additional
			 * roots in the document but they won't break.
			 */
			isRootDataStore = attributes.isRootDataStore ?? true;

			if (hasIsolatedChannels(attributes)) {
				tree = tree.trees[channelsTreeName];
				assert(
					tree !== undefined,
					0x1fe /* "isolated channels subtree should exist in remote datastore snapshot" */,
				);
			}
		}

		return {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			pkg: this.pkg!,
			isRootDataStore,
			snapshot: tree,
			sequenceNumber,
		};
	});

	public async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
		return this.initialSnapshotDetailsP;
	}

	/**
	 * @see FluidDataStoreContext.getAttachData
	 */
	public getAttachData(includeGCData: boolean): {
		attachSummary: ISummaryTreeWithStats;
		type: string;
		gcData?: IGarbageCollectionData;
	} {
		throw new Error("Cannot attach remote store");
	}
}

/**
 * Base class for detached & attached context classes
 */
export class LocalFluidDataStoreContextBase extends FluidDataStoreContext {
	private readonly snapshotTree: ISnapshotTree | undefined;
	/**
	 * @deprecated 0.16 Issue #1635, #3631
	 */
	public readonly createProps?: any;

	constructor(props: ILocalFluidDataStoreContextProps) {
		super(
			props,
			props.snapshotTree !== undefined ? true : false /* existing */,
			true /* isLocalDataStore */,
			props.makeLocallyVisibleFn,
		);

		// Summarizer client should not create local data stores.
		this.identifyLocalChangeInSummarizer("DataStoreCreatedInSummarizer");

		this.snapshotTree = props.snapshotTree;
		if (props.isRootDataStore === true) {
			this.setInMemoryRoot();
		}
		this.createProps = props.createProps;
		this.attachListeners();
	}

	private attachListeners(): void {
		this.once("attaching", () => {
			assert(
				this.attachState === AttachState.Detached,
				0x14d /* "Should move from detached to attaching" */,
			);
			this._attachState = AttachState.Attaching;
		});
		this.once("attached", () => {
			assert(
				this.attachState === AttachState.Attaching,
				0x14e /* "Should move from attaching to attached" */,
			);
			this._attachState = AttachState.Attached;
		});
	}

	/**
	 * @see FluidDataStoreContext.getAttachData
	 */
	public getAttachData(
		includeGCData: boolean,
		telemetryContext?: ITelemetryContext,
	): {
		attachSummary: ISummaryTreeWithStats;
		type: string;
		gcData?: IGarbageCollectionData;
	} {
		assert(
			this.channel !== undefined,
			0x14f /* "There should be a channel when generating attach message" */,
		);
		assert(
			this.pkg !== undefined,
			0x150 /* "pkg should be available in local data store context" */,
		);

		const attachSummary = this.channel.getAttachSummary(telemetryContext);

		// Wrap dds summaries in .channels subtree.
		wrapSummaryInChannelsTree(attachSummary);

		// Add data store's attributes to the summary.
		const attributes = createAttributes(this.pkg, this.isInMemoryRoot());
		addBlobToSummary(attachSummary, dataStoreAttributesBlobName, JSON.stringify(attributes));

		// Add loadingGroupId to the summary
		if (this.loadingGroupId !== undefined) {
			attachSummary.summary.groupId = this.loadingGroupId;
		}

		return {
			attachSummary,
			type: this.pkg[this.pkg.length - 1],
			gcData: includeGCData ? this.channel.getAttachGCData?.(telemetryContext) : undefined,
		};
	}

	private readonly initialSnapshotDetailsP = new LazyPromise<ISnapshotDetails>(async () => {
		let snapshot = this.snapshotTree;
		let attributes: ReadFluidDataStoreAttributes;
		let isRootDataStore = false;
		if (snapshot !== undefined) {
			// Get the dataStore attributes.
			// Note: storage can be undefined in special case while detached.
			attributes = await getFluidDataStoreAttributes(this.storage, snapshot);
			if (hasIsolatedChannels(attributes)) {
				snapshot = snapshot.trees[channelsTreeName];
				assert(
					snapshot !== undefined,
					0x1ff /* "isolated channels subtree should exist in local datastore snapshot" */,
				);
			}
			if (this.pkg === undefined) {
				this.pkg = JSON.parse(attributes.pkg) as string[];
				// If there is no isRootDataStore in the attributes blob, set it to true. This ensures that data
				// stores in older documents are not garbage collected incorrectly. This may lead to additional
				// roots in the document but they won't break.
				if (attributes.isRootDataStore ?? true) {
					isRootDataStore = true;
					this.setInMemoryRoot();
				}
			}
		}
		assert(this.pkg !== undefined, 0x152 /* "pkg should be available in local data store" */);

		return {
			pkg: this.pkg,
			isRootDataStore,
			snapshot,
		};
	});

	public async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
		return this.initialSnapshotDetailsP;
	}

	/**
	 * A context should only be marked as deleted when its a remote context.
	 * Session Expiry at the runtime level should have closed the container creating the local data store context
	 * before delete is even possible. Session Expiry is at 30 days, and sweep is done 36+ days later from the time
	 * it was unreferenced. Thus the sweeping container should have loaded from a snapshot and thus creating a remote
	 * context.
	 */
	public delete() {
		// TODO: GC:Validation - potentially prevent this from happening or asserting. Maybe throw here.
		sendGCUnexpectedUsageEvent(
			this.mc,
			{
				eventName: "GC_Deleted_DataStore_Unexpected_Delete",
				message: "Unexpected deletion of a local data store context",
				category: "error",
				gcTombstoneEnforcementAllowed: undefined,
			},
			this.pkg,
		);
		super.delete();
	}
}

/**
 * context implementation for "attached" data store runtime.
 * Various workflows (snapshot creation, requests) result in .realize() being called
 * on context, resulting in instantiation and attachment of runtime.
 * Runtime is created using data store factory that is associated with this context.
 */
export class LocalFluidDataStoreContext extends LocalFluidDataStoreContextBase {
	constructor(props: ILocalFluidDataStoreContextProps) {
		super(props);
	}
}

/**
 * Detached context. Data Store runtime will be attached to it by attachRuntime() call
 * Before attachment happens, this context is not associated with particular type of runtime
 * or factory, i.e. it's package path is undefined.
 * Attachment process provides all missing parts - package path, data store runtime, and data store factory
 */
export class LocalDetachedFluidDataStoreContext
	extends LocalFluidDataStoreContextBase
	implements IFluidDataStoreContextDetached
{
	constructor(props: ILocalDetachedFluidDataStoreContextProps) {
		super(props);
		this.detachedRuntimeCreation = true;
		this.channelToDataStoreFn = props.channelToDataStoreFn;
	}
	private readonly channelToDataStoreFn: (
		channel: IFluidDataStoreChannel,
		id: string,
	) => IDataStore;

	public async attachRuntime(
		registry: IProvideFluidDataStoreFactory,
		dataStoreChannel: IFluidDataStoreChannel,
	): Promise<IDataStore> {
		assert(this.detachedRuntimeCreation, 0x154 /* "runtime creation is already attached" */);
		this.detachedRuntimeCreation = false;

		assert(this.channelDeferred === undefined, 0x155 /* "channel deferral is already set" */);
		this.channelDeferred = new Deferred<IFluidDataStoreChannel>();

		const factory = registry.IFluidDataStoreFactory;

		const entry = await this.factoryFromPackagePath(this.pkg);
		assert(entry.factory === factory, 0x156 /* "Unexpected factory for package path" */);

		assert(this.registry === undefined, 0x157 /* "datastore registry already attached" */);
		this.registry = entry.registry;

		super.bindRuntime(dataStoreChannel);

		// Load the handle to the data store's entryPoint to make sure that for a detached data store, the entryPoint
		// initialization function is called before the data store gets attached and potentially connected to the
		// delta stream, so it gets a chance to do things while the data store is still "purely local".
		// This preserves the behavior from before we introduced entryPoints, where the instantiateDataStore method
		// of data store factories tends to construct the data object (at least kick off an async method that returns
		// it); that code moved to the entryPoint initialization function, so we want to ensure it still executes
		// before the data store is attached.
		await dataStoreChannel.entryPoint.get();

		if (await this.isRoot()) {
			dataStoreChannel.makeVisibleAndAttachGraph();
		}

		return this.channelToDataStoreFn(dataStoreChannel, this.id);
	}

	public async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
		if (this.detachedRuntimeCreation) {
			throw new Error(
				"Detached Fluid Data Store context can't be realized! Please attach runtime first!",
			);
		}
		return super.getInitialSnapshotDetails();
	}
}

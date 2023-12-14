/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryBaseLogger,
	IDisposable,
	IFluidHandle,
	IRequest,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
	AliasResult,
	channelsTreeName,
	CreateChildSummarizerNodeFn,
	CreateChildSummarizerNodeParam,
	CreateSummarizerNodeSource,
	IAttachMessage,
	IEnvelope,
	IFluidDataStoreContextDetached,
	IGarbageCollectionData,
	IInboundSignalMessage,
	InboundAttachMessage,
	ISummarizeResult,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import {
	convertSnapshotTreeToSummaryTree,
	convertToSummaryTree,
	create404Response,
	createResponseError,
	GCDataBuilder,
	responseToException,
	SummaryTreeBuilder,
	unpackChildNodesUsedRoutes,
} from "@fluidframework/runtime-utils";
import {
	createChildMonitoringContext,
	DataCorruptionError,
	DataProcessingError,
	extractSafePropertiesFromMessage,
	LoggingError,
	MonitoringContext,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import { assert, Lazy } from "@fluidframework/core-utils";
import { v4 as uuid } from "uuid";
import { DataStoreContexts } from "./dataStoreContexts";
import { ContainerRuntime, defaultRuntimeHeaderData, RuntimeHeaderData } from "./containerRuntime";
import {
	FluidDataStoreContext,
	RemoteFluidDataStoreContext,
	LocalFluidDataStoreContext,
	createAttributesBlob,
	LocalDetachedFluidDataStoreContext,
} from "./dataStoreContext";
import { StorageServiceWithAttachBlobs } from "./storageServiceWithAttachBlobs";
import { IDataStoreAliasMessage, isDataStoreAliasMessage } from "./dataStore";
import { GCNodeType, disableDatastoreSweepKey } from "./gc";
import { IContainerRuntimeMetadata, nonDataStorePaths, rootHasIsolatedChannels } from "./summary";

type PendingAliasResolve = (success: boolean) => void;

/**
 * This class encapsulates data store handling. Currently it is only used by the container runtime,
 * but eventually could be hosted on any channel once we formalize the channel api boundary.
 */
export class DataStores implements IDisposable {
	// Stores tracked by the Domain
	private readonly pendingAttach = new Map<string, IAttachMessage>();
	// 0.24 back-compat attachingBeforeSummary
	public readonly attachOpFiredForDataStore = new Set<string>();

	private readonly mc: MonitoringContext;

	private readonly disposeOnce = new Lazy<void>(() => this.contexts.dispose());

	public readonly containerLoadStats: {
		// number of dataStores during loadContainer
		readonly containerLoadDataStoreCount: number;
		// number of unreferenced dataStores during loadContainer
		readonly referencedDataStoreCount: number;
	};

	// Stores the ids of new data stores between two GC runs. This is used to notify the garbage collector of new
	// root data stores that are added.
	private dataStoresSinceLastGC: string[] = [];
	// The handle to the container runtime. This is used mainly for GC purposes to represent outbound reference from
	// the container runtime to other nodes.
	private readonly containerRuntimeHandle: IFluidHandle;
	private readonly pendingAliasMap: Map<string, Promise<AliasResult>> = new Map<
		string,
		Promise<AliasResult>
	>();

	constructor(
		private readonly baseSnapshot: ISnapshotTree | undefined,
		private readonly runtime: ContainerRuntime,
		private readonly submitAttachFn: (attachContent: IAttachMessage) => void,
		private readonly getCreateChildSummarizerNodeFn: (
			id: string,
			createParam: CreateChildSummarizerNodeParam,
		) => CreateChildSummarizerNodeFn,
		private readonly deleteChildSummarizerNodeFn: (id: string) => void,
		baseLogger: ITelemetryBaseLogger,
		private readonly gcNodeUpdated: (
			nodePath: string,
			timestampMs: number,
			packagePath?: readonly string[],
		) => void,
		private readonly isDataStoreDeleted: (nodePath: string) => boolean,
		private readonly aliasMap: Map<string, string>,
		private readonly contexts: DataStoreContexts = new DataStoreContexts(baseLogger),
	) {
		this.mc = createChildMonitoringContext({ logger: baseLogger });
		this.containerRuntimeHandle = new FluidObjectHandle(
			this.runtime,
			"/",
			this.runtime.IFluidHandleContext,
		);

		// Extract stores stored inside the snapshot
		const fluidDataStores = new Map<string, ISnapshotTree>();
		if (baseSnapshot) {
			for (const [key, value] of Object.entries(baseSnapshot.trees)) {
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
			if (this.runtime.attachState !== AttachState.Detached) {
				dataStoreContext = new RemoteFluidDataStoreContext({
					id: key,
					snapshotTree: value,
					runtime: this.runtime,
					storage: this.runtime.storage,
					scope: this.runtime.scope,
					createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(key, {
						type: CreateSummarizerNodeSource.FromSummary,
					}),
				});
			} else {
				if (typeof value !== "object") {
					throw new LoggingError("Snapshot should be there to load from!!");
				}
				const snapshotTree = value;
				dataStoreContext = new LocalFluidDataStoreContext({
					id: key,
					pkg: undefined,
					runtime: this.runtime,
					storage: this.runtime.storage,
					scope: this.runtime.scope,
					createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(key, {
						type: CreateSummarizerNodeSource.FromSummary,
					}),
					makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(key),
					snapshotTree,
					isRootDataStore: undefined,
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

	public processAttachMessage(message: ISequencedDocumentMessage, local: boolean) {
		const attachMessage = message.contents as InboundAttachMessage;

		this.dataStoresSinceLastGC.push(attachMessage.id);

		// The local object has already been attached
		if (local) {
			assert(
				this.pendingAttach.has(attachMessage.id),
				0x15e /* "Local object does not have matching attach message id" */,
			);
			this.contexts.get(attachMessage.id)?.emit("attached");
			this.pendingAttach.delete(attachMessage.id);
			return;
		}

		// If a non-local operation then go and create the object, otherwise mark it as officially attached.
		if (this.alreadyProcessed(attachMessage.id)) {
			// TODO: dataStoreId may require a different tag from PackageData #7488
			const error = new DataCorruptionError(
				// pre-0.58 error message: duplicateDataStoreCreatedWithExistingId
				"Duplicate DataStore created with existing id",
				{
					...extractSafePropertiesFromMessage(message),
					...tagCodeArtifacts({ dataStoreId: attachMessage.id }),
				},
			);
			throw error;
		}

		const flatAttachBlobs = new Map<string, ArrayBufferLike>();
		let snapshotTree: ISnapshotTree | undefined;
		if (attachMessage.snapshot) {
			snapshotTree = buildSnapshotTree(attachMessage.snapshot.entries, flatAttachBlobs);
		}

		// Include the type of attach message which is the pkg of the store to be
		// used by RemoteFluidDataStoreContext in case it is not in the snapshot.
		const pkg = [attachMessage.type];
		const remoteFluidDataStoreContext = new RemoteFluidDataStoreContext({
			id: attachMessage.id,
			snapshotTree,
			runtime: this.runtime,
			storage: new StorageServiceWithAttachBlobs(this.runtime.storage, flatAttachBlobs),
			scope: this.runtime.scope,
			createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(attachMessage.id, {
				type: CreateSummarizerNodeSource.FromAttach,
				sequenceNumber: message.sequenceNumber,
				snapshot: attachMessage.snapshot ?? {
					entries: [createAttributesBlob(pkg, true /* isRootDataStore */)],
				},
			}),
			pkg,
		});

		this.contexts.addBoundOrRemoted(remoteFluidDataStoreContext);
	}

	public processAliasMessage(
		message: ISequencedDocumentMessage,
		localOpMetadata: unknown,
		local: boolean,
	): void {
		const aliasMessage = message.contents as IDataStoreAliasMessage;
		if (!isDataStoreAliasMessage(aliasMessage)) {
			throw new DataCorruptionError("malformedDataStoreAliasMessage", {
				...extractSafePropertiesFromMessage(message),
			});
		}

		const resolve = localOpMetadata as PendingAliasResolve;
		const aliasResult = this.processAliasMessageCore(aliasMessage);
		if (local) {
			resolve(aliasResult);
		}
	}

	public processAliasMessageCore(aliasMessage: IDataStoreAliasMessage): boolean {
		if (this.alreadyProcessed(aliasMessage.alias)) {
			return false;
		}

		const context = this.contexts.get(aliasMessage.internalId);
		// If the data store has been deleted, log an error and ignore this message. This helps prevent document
		// corruption in case a deleted data store accidentally submitted a signal.
		if (
			this.checkAndLogIfDeleted(
				aliasMessage.internalId,
				context,
				"Changed",
				"processAliasMessageCore",
			)
		) {
			return false;
		}

		if (context === undefined) {
			this.mc.logger.sendErrorEvent({
				eventName: "AliasFluidDataStoreNotFound",
				fluidDataStoreId: aliasMessage.internalId,
			});
			return false;
		}

		const handle = new FluidObjectHandle(
			context,
			aliasMessage.internalId,
			this.runtime.IFluidHandleContext,
		);
		this.runtime.addedGCOutboundReference(this.containerRuntimeHandle, handle);

		this.aliasMap.set(aliasMessage.alias, context.id);
		context.setInMemoryRoot();
		return true;
	}

	private alreadyProcessed(id: string): boolean {
		return this.aliasMap.get(id) !== undefined || this.contexts.get(id) !== undefined;
	}

	/**
	 * Make the data stores locally visible in the container graph by moving the data store context from unbound to
	 * bound list. This data store can now be reached from the root.
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
		if (this.runtime.attachState !== AttachState.Detached) {
			localContext.emit("attaching");
			const message = localContext.generateAttachMessage();

			this.pendingAttach.set(id, message);
			this.submitAttachFn(message);
			this.attachOpFiredForDataStore.add(id);
		}

		this.contexts.bind(id);
	}

	public createDetachedDataStoreCore(
		pkg: Readonly<string[]>,
		isRoot: boolean,
		id = uuid(),
	): IFluidDataStoreContextDetached {
		assert(!id.includes("/"), 0x30c /* Id cannot contain slashes */);

		const context = new LocalDetachedFluidDataStoreContext({
			id,
			pkg,
			runtime: this.runtime,
			storage: this.runtime.storage,
			scope: this.runtime.scope,
			createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(id, {
				type: CreateSummarizerNodeSource.Local,
			}),
			makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(id),
			snapshotTree: undefined,
			isRootDataStore: isRoot,
		});
		this.contexts.addUnbound(context);
		return context;
	}

	public _createFluidDataStoreContext(pkg: string[], id: string, props?: any) {
		assert(!id.includes("/"), 0x30d /* Id cannot contain slashes */);
		const context = new LocalFluidDataStoreContext({
			id,
			pkg,
			runtime: this.runtime,
			storage: this.runtime.storage,
			scope: this.runtime.scope,
			createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(id, {
				type: CreateSummarizerNodeSource.Local,
			}),
			makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(id),
			snapshotTree: undefined,
			isRootDataStore: false,
			createProps: props,
		});
		this.contexts.addUnbound(context);
		return context;
	}

	public get disposed() {
		return this.disposeOnce.evaluated;
	}
	public readonly dispose = () => this.disposeOnce.value;

	public resubmitDataStoreOp(envelope: IEnvelope, localOpMetadata: unknown) {
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
		context.reSubmit(envelope.contents, localOpMetadata);
	}

	public rollbackDataStoreOp(envelope: IEnvelope, localOpMetadata: unknown) {
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
		context.rollback(envelope.contents, localOpMetadata);
	}

	public async applyStashedOp(envelope: IEnvelope): Promise<unknown> {
		const context = this.contexts.get(envelope.address);
		// If the data store has been deleted, log an error and ignore this message. This helps prevent document
		// corruption in case the data store that stashed the op is deleted.
		if (this.checkAndLogIfDeleted(envelope.address, context, "Changed", "applyStashedOp")) {
			return undefined;
		}
		assert(!!context, 0x161 /* "There should be a store context for the op" */);
		return context.applyStashedOp(envelope.contents);
	}

	public async applyStashedAttachOp(message: IAttachMessage) {
		this.pendingAttach.set(message.id, message);
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		this.processAttachMessage({ contents: message } as ISequencedDocumentMessage, false);
	}

	public processFluidDataStoreOp(
		message: ISequencedDocumentMessage,
		local: boolean,
		localMessageMetadata: unknown,
	) {
		const envelope = message.contents as IEnvelope;
		const transformed = { ...message, contents: envelope.contents };
		const context = this.contexts.get(envelope.address);

		// If the data store has been deleted, log an error and ignore this message. This helps prevent document
		// corruption in case a deleted data store accidentally submitted an op.
		if (
			this.checkAndLogIfDeleted(
				envelope.address,
				context,
				"Changed",
				"processFluidDataStoreOp",
			)
		) {
			return;
		}

		assert(!!context, 0x162 /* "There should be a store context for the op" */);
		context.process(transformed, local, localMessageMetadata);

		// Notify that a GC node for the data store changed. This is used to detect if a deleted data store is
		// being used.
		this.gcNodeUpdated(
			`/${envelope.address}`,
			message.timestamp,
			context.isLoaded ? context.packagePath : undefined,
		);
	}

	public async getDataStore(
		id: string,
		requestHeaderData: RuntimeHeaderData,
	): Promise<FluidDataStoreContext> {
		const headerData = { ...defaultRuntimeHeaderData, ...requestHeaderData };
		if (
			this.checkAndLogIfDeleted(
				id,
				this.contexts.get(id),
				"Requested",
				"getDataStore",
				requestHeaderData,
			)
		) {
			// The requested data store has been deleted by gc. Create a 404 response exception.
			const request: IRequest = { url: id };
			throw responseToException(
				createResponseError(404, "DataStore was deleted", request),
				request,
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
	): Promise<FluidDataStoreContext | undefined> {
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
	 * @param callSite - The function name this is called from.
	 * @param requestHeaderData - The request header information to log if the data store is deleted.
	 * @returns true if the data store is deleted. Otherwise, returns false.
	 */
	private checkAndLogIfDeleted(
		id: string,
		context: FluidDataStoreContext | undefined,
		deletedLogSuffix: string,
		callSite: string,
		requestHeaderData?: RuntimeHeaderData,
	) {
		const dataStoreNodePath = `/${id}`;
		if (!this.isDataStoreDeleted(dataStoreNodePath)) {
			return false;
		}

		this.mc.logger.sendErrorEvent({
			eventName: `GC_Deleted_DataStore_${deletedLogSuffix}`,
			...tagCodeArtifacts({ id }),
			callSite,
			headers: JSON.stringify(requestHeaderData),
			exists: context !== undefined,
		});
		return true;
	}

	public processSignal(fluidDataStoreId: string, message: IInboundSignalMessage, local: boolean) {
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

	public setConnectionState(connected: boolean, clientId?: string) {
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
							runtimeConnected: this.runtime.connected,
							connected,
						}),
					},
					error,
				);
			}
		}
	}

	public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
		const eventName = attachState === AttachState.Attaching ? "attaching" : "attached";
		for (const [, context] of this.contexts) {
			// Fire only for bounded stores.
			if (!this.contexts.isNotBound(context.id)) {
				context.emit(eventName);
			}
		}
	}

	public get size(): number {
		return this.contexts.size;
	}

	public async summarize(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		const summaryBuilder = new SummaryTreeBuilder();

		// Iterate over each store and ask it to snapshot
		await Promise.all(
			Array.from(this.contexts)
				.filter(([_, context]) => {
					// Summarizer works only with clients with no local changes. A data store in attaching
					// state indicates an op was sent to attach a local data store, and the the attach op
					// had not yet round tripped back to the client.
					if (context.attachState === AttachState.Attaching) {
						// Formerly assert 0x588
						const error = DataProcessingError.create(
							"Local data store detected in attaching state during summarize",
							"summarize",
						);
						throw error;
					}
					return context.attachState === AttachState.Attached;
				})
				.map(async ([contextId, context]) => {
					const contextSummary = await context.summarize(
						fullTree,
						trackState,
						telemetryContext,
					);
					summaryBuilder.addWithStats(contextId, contextSummary);
				}),
		);

		return summaryBuilder.getSummaryTree();
	}

	public createSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		// Attaching graph of some stores can cause other stores to get bound too.
		// So keep taking summary until no new stores get bound.
		let notBoundContextsLength: number;
		do {
			const builderTree = builder.summary.tree;
			notBoundContextsLength = this.contexts.notBoundLength();
			// Iterate over each data store and ask it to snapshot
			Array.from(this.contexts)
				.filter(
					([key, _]) =>
						// Take summary of bounded data stores only, make sure we haven't summarized them already
						// and no attach op has been fired for that data store because for loader versions <= 0.24
						// we set attach state as "attaching" before taking createNew summary.
						!(
							this.contexts.isNotBound(key) ||
							builderTree[key] ||
							this.attachOpFiredForDataStore.has(key)
						),
				)
				.map(([key, value]) => {
					let dataStoreSummary: ISummarizeResult;
					if (value.isLoaded) {
						const snapshot = value.generateAttachMessage().snapshot;
						dataStoreSummary = convertToSummaryTree(snapshot, true);
					} else {
						// If this data store is not yet loaded, then there should be no changes in the snapshot from
						// which it was created as it is detached container. So just use the previous snapshot.
						assert(
							!!this.baseSnapshot,
							0x166 /* "BaseSnapshot should be there as detached container loaded from snapshot" */,
						);
						dataStoreSummary = convertSnapshotTreeToSummaryTree(
							this.baseSnapshot.trees[key],
						);
					}
					builder.addWithStats(key, dataStoreSummary);
				});
		} while (notBoundContextsLength !== this.contexts.notBoundLength());

		return builder.getSummaryTree();
	}

	/**
	 * Before GC runs, called by the garbage collector to update any pending GC state.
	 * The garbage collector needs to know all outbound references that are added. Since root data stores are not
	 * explicitly marked as referenced, notify GC of new root data stores that were added since the last GC run.
	 */
	public async updateStateBeforeGC(): Promise<void> {
		for (const id of this.dataStoresSinceLastGC) {
			const context = this.contexts.get(id);
			assert(context !== undefined, 0x2b6 /* Missing data store context */);
			if (await context.isRoot()) {
				// A root data store is basically a reference from the container runtime to the data store.
				const handle = new FluidObjectHandle(context, id, this.runtime.IFluidHandleContext);
				this.runtime.addedGCOutboundReference(this.containerRuntimeHandle, handle);
			}
		}
		this.dataStoresSinceLastGC = [];
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
		// Iterate over each store and get their GC data.
		await Promise.all(
			Array.from(this.contexts)
				.filter(([_, context]) => {
					// Summarizer client and hence GC works only with clients with no local changes. A data store in
					// attaching state indicates an op was sent to attach a local data store, and the the attach op
					// had not yet round tripped back to the client.
					// Formerly assert 0x589
					if (context.attachState === AttachState.Attaching) {
						const error = DataProcessingError.create(
							"Local data store detected in attaching state while running GC",
							"getGCData",
						);
						throw error;
					}

					return context.attachState === AttachState.Attached;
				})
				.map(async ([contextId, context]) => {
					const contextGCData = await context.getGCData(fullGC);
					// Prefix the child's id to the ids of its GC nodes so they can be identified as belonging to the child.
					// This also gradually builds the id of each node to be a path from the root.
					builder.prefixAndAddNodes(contextId, contextGCData.gcNodes);
				}),
		);

		// Get the outbound routes and add a GC node for this channel.
		builder.addNode("/", await this.getOutboundRoutes());
		return builder.getGCData();
	}

	/**
	 * After GC has run, called to notify this Container's data stores of routes that are used in it.
	 * @param usedRoutes - The routes that are used in all data stores in this Container.
	 */
	public updateUsedRoutes(usedRoutes: readonly string[]) {
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

	/**
	 * This is called to update objects whose routes are unused. The unused objects are deleted.
	 * @param unusedRoutes - The routes that are unused in all data stores in this Container.
	 */
	public updateUnusedRoutes(unusedRoutes: readonly string[]) {
		for (const route of unusedRoutes) {
			const pathParts = route.split("/");
			// Delete data store only if its route (/datastoreId) is in unusedRoutes. We don't want to delete a data
			// store based on its DDS being unused.
			if (pathParts.length > 2) {
				continue;
			}
			const dataStoreId = pathParts[1];
			assert(this.contexts.has(dataStoreId), 0x2d7 /* No data store with specified id */);
			// Delete the contexts of unused data stores.
			this.contexts.delete(dataStoreId);
			// Delete the summarizer node of the unused data stores.
			this.deleteChildSummarizerNodeFn(dataStoreId);
		}
	}

	/**
	 * Delete data stores and its objects that are sweep ready.
	 * @param sweepReadyDataStoreRoutes - The routes of data stores and its objects that are sweep ready and should
	 * be deleted.
	 * @returns The routes of data stores and its objects that were deleted.
	 */
	public deleteSweepReadyNodes(sweepReadyDataStoreRoutes: readonly string[]): readonly string[] {
		// If sweep for data stores is not enabled, return empty list indicating nothing is deleted.
		if (this.mc.config.getBoolean(disableDatastoreSweepKey) === true) {
			return [];
		}
		for (const route of sweepReadyDataStoreRoutes) {
			const pathParts = route.split("/");
			const dataStoreId = pathParts[1];

			// Ignore sub-data store routes because a data store and its sub-routes are deleted together, so, we only
			// need to delete the data store.
			if (pathParts.length > 2) {
				continue;
			}

			const dataStoreContext = this.contexts.get(dataStoreId);
			if (dataStoreContext === undefined) {
				this.mc.logger.sendErrorEvent({
					eventName: "DeletedDataStoreNotFound",
					...tagCodeArtifacts({ id: dataStoreId }),
					details: {
						alreadyDeleted: this.isDataStoreDeleted(dataStoreId),
					},
				});
				continue;
			}

			dataStoreContext.delete();

			// Delete the contexts of sweep ready data stores.
			this.contexts.delete(dataStoreId);
			// Delete the summarizer node of the sweep ready data stores.
			this.deleteChildSummarizerNodeFn(dataStoreId);
		}
		return Array.from(sweepReadyDataStoreRoutes);
	}

	/**
	 * This is called to update objects whose routes are tombstones. Tombstoned datastore contexts enable testing
	 * scenarios with accessing deleted content without actually deleting content from summaries.
	 * @param tombstonedRoutes - The routes that are tombstones in all data stores in this Container.
	 */
	public updateTombstonedRoutes(tombstonedRoutes: readonly string[]) {
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
		for (const [contextId, context] of this.contexts) {
			const isRootDataStore = await context.isRoot();
			if (isRootDataStore) {
				outboundRoutes.push(`/${contextId}`);
			}
		}
		return outboundRoutes;
	}

	/**
	 * Called by GC to retrieve the package path of a data store node with the given path.
	 */
	public async getDataStorePackagePath(nodePath: string): Promise<readonly string[] | undefined> {
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";
import { DataProcessingError, ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IChannel, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
	IFluidDataStoreContext,
	IGarbageCollectionData,
	ISummarizeResult,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { assert, Lazy, LazyPromise } from "@fluidframework/core-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISnapshotTreeWithBlobContents } from "@fluidframework/container-definitions";
import {
	ChannelServiceEndpoints,
	createChannelServiceEndpoints,
	IChannelContext,
	loadChannel,
	loadChannelFactoryAndAttributes,
	summarizeChannel,
	summarizeChannelAsync,
} from "./channelContext";
import { ISharedObjectRegistry } from "./dataStoreRuntime";

/**
 * Channel context for a locally created channel
 */
export abstract class LocalChannelContextBase implements IChannelContext {
	private globallyVisible = false;
	protected readonly pending: ISequencedDocumentMessage[] = [];
	constructor(
		protected readonly id: string,
		protected readonly runtime: IFluidDataStoreRuntime,
		protected readonly services: Lazy<ChannelServiceEndpoints>,
		private readonly channelP: Promise<IChannel>,
		private _channel?: IChannel,
	) {
		assert(!this.id.includes("/"), 0x30f /* Channel context ID cannot contain slashes */);
	}

	public async getChannel(): Promise<IChannel> {
		if (this._channel === undefined) {
			return this.channelP.then((c) => (this._channel = c));
		}
		return this.channelP;
	}

	public get isLoaded(): boolean {
		return this._channel !== undefined;
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		// Connection events are ignored if the data store is not yet globallyVisible or loaded
		if (this.globallyVisible && this.isLoaded) {
			this.services.value.deltaConnection.setConnectionState(connected);
		}
	}

	public processOp(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		assert(
			this.globallyVisible,
			0x2d3 /* "Local channel must be globally visible when processing op" */,
		);

		// A local channel may not be loaded in case where we rehydrate the container from a snapshot because of
		// delay loading. So after the container is attached and some other client joins which start generating
		// ops for this channel. So not loaded local channel can still receive ops and we store them to process later.
		if (this.isLoaded) {
			this.services.value.deltaConnection.process(message, local, localOpMetadata);
		} else {
			assert(
				local === false,
				0x189 /* "Should always be remote because a local dds shouldn't generate ops before loading" */,
			);
			this.pending.push(message);
		}
	}

	public reSubmit(content: any, localOpMetadata: unknown) {
		assert(this.isLoaded, 0x18a /* "Channel should be loaded to resubmit ops" */);
		assert(
			this.globallyVisible,
			0x2d4 /* "Local channel must be globally visible when resubmitting op" */,
		);
		this.services.value.deltaConnection.reSubmit(content, localOpMetadata);
	}
	public rollback(content: any, localOpMetadata: unknown) {
		assert(this.isLoaded, 0x2ee /* "Channel should be loaded to rollback ops" */);
		assert(
			this.globallyVisible,
			0x2ef /* "Local channel must be globally visible when rolling back op" */,
		);
		this.services.value.deltaConnection.rollback(content, localOpMetadata);
	}

	public applyStashedOp() {
		throw new Error("no stashed ops on local channel");
	}

	/**
	 * Returns a summary at the current sequence number.
	 * @param fullTree - true to bypass optimizations and force a full summary tree
	 * @param trackState - This tells whether we should track state from this summary.
	 * @param telemetryContext - summary data passed through the layers for telemetry purposes
	 */
	public async summarize(
		fullTree: boolean = false,
		trackState: boolean = false,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummarizeResult> {
		const channel = await this.getChannel();
		return summarizeChannelAsync(channel, fullTree, trackState, telemetryContext);
	}

	public getAttachSummary(telemetryContext?: ITelemetryContext): ISummarizeResult {
		assert(
			this._channel !== undefined,
			0x18d /* "Channel should be loaded to take snapshot" */,
		);
		return summarizeChannel(
			this._channel,
			true /* fullTree */,
			false /* trackState */,
			telemetryContext,
		);
	}

	public makeVisible(): void {
		if (this.globallyVisible) {
			throw new Error("Channel is already globally visible");
		}

		if (this.isLoaded) {
			assert(!!this._channel, 0x192 /* "Channel should be there if loaded!!" */);
			this._channel.connect(this.services.value);
		}
		this.globallyVisible = true;
	}

	/**
	 * Returns the data used for garbage collection. This includes a list of GC nodes that represent this context.
	 * Each node has a set of outbound routes to other GC nodes in the document. This should be called only after
	 * the context has loaded.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		const channel = await this.getChannel();
		return channel.getGCData(fullGC);
	}

	public updateUsedRoutes(usedRoutes: string[]) {
		/**
		 * Currently, DDSes are always considered referenced and are not garbage collected.
		 * Once we have GC at DDS level, this channel context's used routes will be updated as per the passed
		 * value. See - https://github.com/microsoft/FluidFramework/issues/4611
		 */
	}
}

export class RehydratedLocalChannelContext extends LocalChannelContextBase {
	private readonly dirtyFn: () => void;
	constructor(
		id: string,
		registry: ISharedObjectRegistry,
		runtime: IFluidDataStoreRuntime,
		dataStoreContext: IFluidDataStoreContext,
		storageService: IDocumentStorageService,
		logger: ITelemetryLoggerExt,
		submitFn: (content: any, localOpMetadata: unknown) => void,
		dirtyFn: (address: string) => void,
		addedGCOutboundReferenceFn: (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) => void,
		private readonly snapshotTree: ISnapshotTree,
	) {
		super(
			id,
			runtime,
			new Lazy(() => {
				const blobMap: Map<string, ArrayBufferLike> = new Map<string, ArrayBufferLike>();
				const clonedSnapshotTree = cloneDeep(this.snapshotTree);
				// 0.47 back-compat Need to sanitize if snapshotTree.blobs still contains blob contents too.
				// This is for older snapshot which is generated by loader <=0.47 version which still contains
				// the contents within blobs. After a couple of revisions we can remove it.
				if (this.isSnapshotInOldFormatAndCollectBlobs(clonedSnapshotTree, blobMap)) {
					this.sanitizeSnapshot(clonedSnapshotTree);
				}
				return createChannelServiceEndpoints(
					dataStoreContext.connected,
					submitFn,
					this.dirtyFn,
					addedGCOutboundReferenceFn,
					storageService,
					logger,
					clonedSnapshotTree,
					blobMap,
				);
			}),
			new LazyPromise<IChannel>(async () => {
				try {
					const { attributes, factory } = await loadChannelFactoryAndAttributes(
						dataStoreContext,
						this.services.value,
						this.id,
						registry,
					);
					const channel = await loadChannel(
						runtime,
						attributes,
						factory,
						this.services.value,
						logger,
						this.id,
					);
					// Send all pending messages to the channel
					for (const message of this.pending) {
						this.services.value.deltaConnection.process(
							message,
							false,
							undefined /* localOpMetadata */,
						);
					}
					return channel;
				} catch (err) {
					throw DataProcessingError.wrapIfUnrecognized(
						err,
						"rehydratedLocalChannelContextFailedToLoadChannel",
						undefined,
					);
				}
			}),
		);

		this.dirtyFn = () => {
			dirtyFn(id);
		};
	}

	private isSnapshotInOldFormatAndCollectBlobs(
		snapshotTree: ISnapshotTreeWithBlobContents,
		blobMap: Map<string, ArrayBufferLike>,
	): boolean {
		let sanitize = false;
		const blobsContents = snapshotTree.blobsContents;
		if (blobsContents !== undefined) {
			Object.entries(blobsContents).forEach(([key, value]) => {
				blobMap.set(key, value);
				if (snapshotTree.blobs[key] !== undefined) {
					sanitize = true;
				}
			});
		}
		for (const value of Object.values(snapshotTree.trees)) {
			sanitize = sanitize || this.isSnapshotInOldFormatAndCollectBlobs(value, blobMap);
		}
		return sanitize;
	}

	private sanitizeSnapshot(snapshotTree: ISnapshotTree) {
		const blobMapInitial = new Map(Object.entries(snapshotTree.blobs));
		for (const [blobName, blobId] of blobMapInitial.entries()) {
			const blobValue = blobMapInitial.get(blobId);
			if (blobValue === undefined) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete snapshotTree.blobs[blobName];
			}
		}
		for (const value of Object.values(snapshotTree.trees)) {
			this.sanitizeSnapshot(value);
		}
	}
}

export class LocalChannelContext extends LocalChannelContextBase {
	private readonly dirtyFn: () => void;
	constructor(
		public readonly channel: IChannel,
		runtime: IFluidDataStoreRuntime,
		dataStoreContext: IFluidDataStoreContext,
		storageService: IDocumentStorageService,
		logger: ITelemetryLoggerExt,
		submitFn: (content: any, localOpMetadata: unknown) => void,
		dirtyFn: (address: string) => void,
		addedGCOutboundReferenceFn: (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) => void,
	) {
		super(
			channel.id,
			runtime,
			new Lazy(() => {
				return createChannelServiceEndpoints(
					dataStoreContext.connected,
					submitFn,
					this.dirtyFn,
					addedGCOutboundReferenceFn,
					storageService,
					logger,
				);
			}),
			Promise.resolve(channel),
			channel,
		);
		this.channel = channel;

		this.dirtyFn = () => {
			dirtyFn(channel.id);
		};
	}
}

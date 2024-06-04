/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, LazyPromise } from "@fluidframework/core-utils/internal";
import { IChannel, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import {
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
	IGarbageCollectionData,
	CreateChildSummarizerNodeFn,
	IFluidDataStoreContext,
	ISummarizeInternalResult,
	ISummarizeResult,
	ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITelemetryLoggerExt,
	ThresholdCounter,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import {
	ChannelServiceEndpoints,
	IChannelContext,
	createChannelServiceEndpoints,
	loadChannel,
	loadChannelFactoryAndAttributes,
	summarizeChannelAsync,
} from "./channelContext.js";
import { ISharedObjectRegistry } from "./dataStoreRuntime.js";

export class RemoteChannelContext implements IChannelContext {
	private isLoaded = false;
	private pending: ISequencedDocumentMessage[] | undefined = [];
	private readonly channelP: Promise<IChannel>;
	private channel: IChannel | undefined;
	private readonly services: ChannelServiceEndpoints;
	private readonly summarizerNode: ISummarizerNodeWithGC;
	private readonly subLogger: ITelemetryLoggerExt;
	private readonly thresholdOpsCounter: ThresholdCounter;
	private static readonly pendingOpsCountThreshold = 1000;

	constructor(
		runtime: IFluidDataStoreRuntime,
		dataStoreContext: IFluidDataStoreContext,
		storageService: IDocumentStorageService,
		submitFn: (content: any, localOpMetadata: unknown) => void,
		dirtyFn: (address: string) => void,
		addedGCOutboundReferenceFn: (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) => void,
		private readonly id: string,
		baseSnapshot: ISnapshotTree,
		registry: ISharedObjectRegistry,
		extraBlobs: Map<string, ArrayBufferLike> | undefined,
		createSummarizerNode: CreateChildSummarizerNodeFn,
		attachMessageType?: string,
	) {
		assert(!this.id.includes("/"), 0x310 /* Channel context ID cannot contain slashes */);

		this.subLogger = createChildLogger({
			logger: runtime.logger,
			namespace: "RemoteChannelContext",
		});

		this.services = createChannelServiceEndpoints(
			dataStoreContext.connected,
			submitFn,
			() => dirtyFn(this.id),
			addedGCOutboundReferenceFn,
			() => runtime.attachState !== AttachState.Detached,
			storageService,
			this.subLogger,
			baseSnapshot,
			extraBlobs,
		);

		this.channelP = new LazyPromise<IChannel>(async () => {
			const { attributes, factory } = await loadChannelFactoryAndAttributes(
				dataStoreContext,
				this.services,
				this.id,
				registry,
				attachMessageType,
			);

			const channel = await loadChannel(
				runtime,
				attributes,
				factory,
				this.services,
				this.subLogger,
				this.id,
			);

			// Send all pending messages to the channel
			assert(this.pending !== undefined, 0x23f /* "pending undefined" */);
			for (const message of this.pending) {
				this.services.deltaConnection.process(
					message,
					false,
					undefined /* localOpMetadata */,
				);
			}
			this.thresholdOpsCounter.send("ProcessPendingOps", this.pending.length);

			// Commit changes.
			this.channel = channel;
			this.pending = undefined;
			this.isLoaded = true;

			// Because have some await between we created the service and here, the connection state might have changed
			// and we don't propagate the connection state when we are not loaded.  So we have to set it again here.
			this.services.deltaConnection.setConnectionState(dataStoreContext.connected);
			return this.channel;
		});

		const thisSummarizeInternal = async (
			fullTree: boolean,
			trackState: boolean,
			telemetryContext?: ITelemetryContext,
			incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
		) =>
			this.summarizeInternal(
				fullTree,
				trackState,
				telemetryContext,
				incrementalSummaryContext,
			);

		this.summarizerNode = createSummarizerNode(
			thisSummarizeInternal,
			async (fullGC?: boolean) => this.getGCDataInternal(fullGC),
		);

		this.thresholdOpsCounter = new ThresholdCounter(
			RemoteChannelContext.pendingOpsCountThreshold,
			this.subLogger,
		);
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public getChannel(): Promise<IChannel> {
		return this.channelP;
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		// Connection events are ignored if the data store is not yet loaded
		if (!this.isLoaded) {
			return;
		}

		this.services.deltaConnection.setConnectionState(connected);
	}

	public applyStashedOp(content: any): unknown {
		assert(this.isLoaded, 0x194 /* "Remote channel must be loaded when rebasing op" */);
		return this.services.deltaConnection.applyStashedOp(content);
	}

	public processOp(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.summarizerNode.invalidate(message.sequenceNumber);

		if (this.isLoaded) {
			this.services.deltaConnection.process(message, local, localOpMetadata);
		} else {
			assert(!local, 0x195 /* "Remote channel must not be local when processing op" */);
			assert(this.pending !== undefined, 0x23e /* "pending is undefined" */);
			this.pending.push(message);
			this.thresholdOpsCounter.sendIfMultiple("StorePendingOps", this.pending.length);
		}
	}

	public reSubmit(content: any, localOpMetadata: unknown) {
		assert(this.isLoaded, 0x196 /* "Remote channel must be loaded when resubmitting op" */);

		this.services.deltaConnection.reSubmit(content, localOpMetadata);
	}

	public rollback(content: any, localOpMetadata: unknown) {
		assert(this.isLoaded, 0x2f0 /* "Remote channel must be loaded when rolling back op" */);

		this.services.deltaConnection.rollback(content, localOpMetadata);
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
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): Promise<ISummarizeInternalResult> {
		const channel = await this.getChannel();
		const summarizeResult = await summarizeChannelAsync(
			channel,
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
		return { ...summarizeResult, id: this.id };
	}

	/**
	 * Returns the data used for garbage collection. This includes a list of GC nodes that represent this context.
	 * Each node has a set of outbound routes to other GC nodes in the document.
	 * If there is no new data in this context since the last summary, previous GC data is used.
	 * If there is new data, the GC data is generated again (by calling getGCDataInternal).
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		return this.summarizerNode.getGCData(fullGC);
	}

	/**
	 * Generates the data used for garbage collection. This is called when there is new data since last summary. It
	 * loads the context and calls into the channel to get its GC data.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	private async getGCDataInternal(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		const channel = await this.getChannel();
		return channel.getGCData(fullGC);
	}

	public updateUsedRoutes(usedRoutes: string[]) {
		/**
		 * Currently, DDSes are always considered referenced and are not garbage collected. Update the summarizer node's
		 * used routes to contain a route to this channel context.
		 * Once we have GC at DDS level, this will be updated to use the passed usedRoutes. See -
		 * https://github.com/microsoft/FluidFramework/issues/4611
		 */
		this.summarizerNode.updateUsedRoutes([""]);
	}
}

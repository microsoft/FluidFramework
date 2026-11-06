/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter, type ILayerCompatDetails } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import type { IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";
import type {
	IFluidHandleContext,
	IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { assert, Deferred } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeEvents,
} from "@fluidframework/datastore-definitions/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	FluidDataStoreContextInternal,
	IGarbageCollectionData,
	IInboundSignalMessage,
	IRuntimeMessageCollection,
	ISummaryTreeWithStats,
	ITelemetryContext,
	OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";
import {
	create404Response,
	getConfigForMinVersionForCollab,
	toDeltaManagerErased,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import {
	DataCorruptionError,
	UsageError,
	createChildLogger,
	createChildMonitoringContext,
	raiseConnectedEvent,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import {
	type ChannelServiceEndpoints,
	createChannelServiceEndpoints,
	loadChannelFactoryAndAttributes,
	loadChannel,
	summarizeChannel,
	summarizeChannelAsync,
} from "./channelContext.js";
import {
	dataStoreCompatDetailsForRuntime,
	validateRuntimeCompatibility,
} from "./dataStoreLayerCompatState.js";
import { LegacyTypeAwareRegistry } from "./dataStoreRuntime.js";

/**
 * Hosts a shared object at a data-store channel's own identity.
 * Unlike a data-store runtime, this runtime does not introduce a collection of child channels.
 * The shared object's summary, handle, and garbage-collection node belong directly to its context.
 * @internal
 */
export class LeafChannelRuntime
	extends TypedEventEmitter<IFluidDataStoreRuntimeEvents>
	implements IFluidDataStoreRuntime, IFluidDataStoreChannel
{
	private channel: IChannel | undefined;
	private readonly services: ChannelServiceEndpoints;
	private readonly attached = new Deferred<void>();
	private visible: boolean;
	private _disposed = false;
	private pendingOpCount = 0;
	private _attachState: AttachState;
	private readonly handleContext: IFluidHandleContext;
	private localActivity: "applyStashed" | "rollback" | undefined;
	private readonly telemetryLogger: TelemetryLoggerExt;

	private constructor(
		private readonly context: IFluidDataStoreContext,
		existing: boolean,
	) {
		super();
		this.visible = existing;
		this._attachState = context.attachState;
		this.telemetryLogger = createChildLogger({ logger: context.baseLogger });
		const { ILayerCompatDetails: compatibility } = context as IFluidDataStoreContext &
			Partial<{ ILayerCompatDetails: ILayerCompatDetails }>;
		validateRuntimeCompatibility(
			compatibility,
			() => this.dispose(),
			createChildMonitoringContext({ logger: context.baseLogger }),
		);
		const parent = context.IFluidHandleContext;
		this.handleContext = {
			get IFluidHandleContext() {
				return this;
			},
			absolutePath: parent.absolutePath,
			routeContext: parent,
			get isAttached() {
				return context.attachState !== AttachState.Detached;
			},
			attachGraph: () => this.makeVisibleAndAttachGraph(),
			resolveHandle: async (request) => parent.resolveHandle(request),
		};
		this.services = createChannelServiceEndpoints(
			context.connected,
			(contents, metadata) => {
				this.verifyOpen();
				context.submitMessage("op", { address: "", contents }, metadata);
				this.pendingOpCount++;
			},
			() => context.setChannelDirty(""),
			() => this.attachState !== AttachState.Detached,
			context.storage,
			this.telemetryLogger,
			context.baseSnapshot,
		);
		if (context.attachState === AttachState.Attached) {
			this.attached.resolve();
		}
	}

	/**
	 * Creates or loads a shared object without allocating a separate child identity.
	 */
	public static async load(
		context: IFluidDataStoreContext,
		existing: boolean,
		factory: IChannelFactory,
	): Promise<LeafChannelRuntime> {
		if (
			(context as FluidDataStoreContextInternal).isSharedObjectChannel !== true &&
			!getConfigForMinVersionForCollab(context.oldestSupportedClient, {
				"2.0.0": false,
				"3.12.0": true,
			})
		) {
			throw new UsageError(
				"Direct shared-object hosting requires oldestSupportedClient >= 3.12.0",
			);
		}
		const runtime = new LeafChannelRuntime(context, existing);
		if (existing) {
			const { attributes } = await loadChannelFactoryAndAttributes(
				context,
				runtime.services,
				context.id,
				new LegacyTypeAwareRegistry({
					get: (type) => (type === factory.type ? factory : undefined),
				}),
			);
			runtime.channel = await loadChannel(
				runtime,
				attributes,
				factory,
				runtime.services,
				runtime.telemetryLogger,
				context.id,
			);
		} else {
			runtime.channel = factory.create(runtime, context.id);
			runtime.channel.connect(runtime.services);
		}
		return runtime;
	}

	private get loadedChannel(): IChannel {
		assert(this.channel !== undefined, "Leaf channel has not finished initialization");
		return this.channel;
	}

	public get ILayerCompatDetails(): ILayerCompatDetails {
		return dataStoreCompatDetailsForRuntime;
	}
	public get id(): string {
		return this.context.id;
	}
	public get entryPoint(): IFluidHandleInternal<IChannel> {
		// IChannel erases its handle's target type, but the channel's handle resolves to itself.
		return toFluidHandleInternal(this.loadedChannel.handle) as IFluidHandleInternal<IChannel>;
	}
	public get IFluidHandleContext(): IFluidHandleContext {
		return this.handleContext;
	}
	public get rootRoutingContext(): IFluidHandleContext {
		return this.handleContext;
	}
	public get channelsRoutingContext(): IFluidHandleContext {
		return this.handleContext;
	}
	public get objectsRoutingContext(): IFluidHandleContext {
		return this.handleContext;
	}
	public get options(): IFluidDataStoreRuntime["options"] {
		return this.context.options;
	}
	public get deltaManager(): IFluidDataStoreRuntime["deltaManager"] {
		return toDeltaManagerErased(this.context.deltaManager);
	}
	public get clientId(): string | undefined {
		return this.context.clientId;
	}
	public get connected(): boolean {
		return this.context.connected;
	}
	public readonly isReadOnly = (): boolean =>
		this.context.isReadOnly?.() ?? this.context.deltaManager.readOnlyInfo.readonly === true;
	public get logger(): IFluidDataStoreRuntime["logger"] {
		return this.context.baseLogger;
	}
	public get attachState(): AttachState {
		return this._attachState;
	}
	public get idCompressor(): IFluidDataStoreRuntime["idCompressor"] {
		return this.context.idCompressor;
	}
	public get oldestSupportedClient(): OldestSupportedClientVersion {
		return this.context.oldestSupportedClient;
	}
	public get inStagingMode(): boolean {
		return this.context.containerRuntime.inStagingMode;
	}
	public get isDirty(): boolean {
		return this.pendingOpCount !== 0;
	}
	public get activeLocalOperationActivity(): "applyStashed" | "rollback" | undefined {
		return this.localActivity;
	}
	public get disposed(): boolean {
		return this._disposed;
	}

	public async getChannel(id: string): Promise<IChannel> {
		this.verifyOpen();
		if (id !== this.id) {
			throw new UsageError("A leaf runtime contains only its own channel");
		}
		return this.loadedChannel;
	}

	public createChannel(): never {
		throw new UsageError("A leaf runtime cannot create child channels");
	}

	public addChannel(): never {
		throw new UsageError("A leaf runtime cannot add child channels");
	}

	public bindChannel(channel: IChannel): void {
		if (channel !== this.loadedChannel) {
			throw new UsageError("Cannot bind another channel to a leaf runtime");
		}
		this.makeVisibleAndAttachGraph();
	}

	public makeVisibleAndAttachGraph(): void {
		this.verifyOpen();
		if (this.visible) {
			return;
		}
		this.visible = true;
		toFluidHandleInternal(this.loadedChannel.handle).attachGraph();
		this.context.makeLocallyVisible();
	}

	public async request(request: IRequest): Promise<IResponse> {
		this.verifyOpen();
		if (request.url === "" || request.url === "/") {
			return { status: 200, mimeType: "fluid/object", value: this.loadedChannel };
		}
		return create404Response(request);
	}

	public getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		return summarizeChannel(this.loadedChannel, true, false, telemetryContext);
	}

	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return summarizeChannelAsync(this.loadedChannel, fullTree, trackState, telemetryContext);
	}

	public getAttachGCData(): IGarbageCollectionData {
		return this.loadedChannel.getGCData(true);
	}

	public async getGCData(fullGC?: boolean): Promise<IGarbageCollectionData> {
		return this.loadedChannel.getGCData(fullGC);
	}

	public updateUsedRoutes(): void {
		// The context tracks this leaf's used routes; there are no child contexts to update.
	}

	public processMessages(collection: IRuntimeMessageCollection): void {
		this.verifyOpen();
		const messagesContent = collection.messagesContent.map((message) => ({
			...message,
			contents: readLeafMessage({
				type: collection.envelope.type,
				content: message.contents,
			}),
		}));
		if (collection.local) {
			this.pendingOpCount -= messagesContent.length;
			assert(this.pendingOpCount >= 0, "Leaf pending operation count is negative");
		}
		this.services.deltaConnection.processMessages({ ...collection, messagesContent });
		for (const { contents, clientSequenceNumber } of collection.messagesContent) {
			this.emit("op", { ...collection.envelope, contents, clientSequenceNumber });
		}
	}

	public processSignal(message: IInboundSignalMessage, local: boolean): void {
		this.emit("signal", message, local);
	}

	public setConnectionState(connected: boolean, clientId?: string): void {
		this.services.deltaConnection.setConnectionState(connected);
		raiseConnectedEvent(this.telemetryLogger, this, connected, clientId);
	}

	public notifyReadOnlyState(readonly: boolean): void {
		this.emit("readonly", readonly);
	}

	public setAttachState(state: AttachState.Attaching | AttachState.Attached): void {
		if (state === this._attachState) {
			return;
		}
		this.makeVisibleAndAttachGraph();
		this._attachState = state;
		this.emit(state === AttachState.Attaching ? "attaching" : "attached");
		if (state === AttachState.Attached) {
			this.attached.resolve();
		}
	}

	public reSubmit(type: string, content: unknown, metadata: unknown, squash: boolean): void {
		this.pendingOpCount--;
		this.services.deltaConnection.reSubmit(
			readLeafMessage({ type, content }),
			metadata,
			squash,
		);
	}

	public async applyStashedOp(content: unknown): Promise<unknown> {
		assert(this.localActivity === undefined, "Leaf operation activity is already set");
		this.localActivity = "applyStashed";
		try {
			this.pendingOpCount++;
			return this.services.deltaConnection.applyStashedOp(readLeafMessage(content));
		} finally {
			this.localActivity = undefined;
		}
	}

	public rollback(type: string, content: unknown, metadata: unknown): void {
		assert(this.localActivity === undefined, "Leaf operation activity is already set");
		this.localActivity = "rollback";
		try {
			this.pendingOpCount--;
			this.services.deltaConnection.rollback(readLeafMessage({ type, content }), metadata);
		} finally {
			this.localActivity = undefined;
		}
	}

	public async uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		this.verifyOpen();
		return this.context.uploadBlob(blob, signal);
	}

	public submitSignal(type: string, content: unknown, targetClientId?: string): void {
		this.verifyOpen();
		this.context.submitSignal(type, content, targetClientId);
	}

	public getQuorum(): ReturnType<IFluidDataStoreRuntime["getQuorum"]> {
		return this.context.getQuorum();
	}

	public getAudience(): ReturnType<IFluidDataStoreRuntime["getAudience"]> {
		return this.context.getAudience();
	}

	public async waitAttached(): Promise<void> {
		return this.attached.promise;
	}

	public dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			this.emit("dispose");
			this.removeAllListeners();
		}
	}

	private verifyOpen(): void {
		if (this.disposed) {
			throw new UsageError("Leaf runtime is disposed");
		}
	}
}

function readLeafMessage(message: unknown): unknown {
	if (
		typeof message === "object" &&
		message !== null &&
		"type" in message &&
		message.type === "op" &&
		"content" in message &&
		typeof message.content === "object" &&
		message.content !== null &&
		"address" in message.content &&
		message.content.address === "" &&
		"contents" in message.content
	) {
		return message.content.contents;
	}
	throw new DataCorruptionError("Invalid leaf channel message", {});
}

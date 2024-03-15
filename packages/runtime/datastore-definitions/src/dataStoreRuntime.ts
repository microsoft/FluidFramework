/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AttachState, IAudience, IDeltaManager } from "@fluidframework/container-definitions";
import type {
	FluidObject,
	IDisposable,
	IEvent,
	IEventProvider,
	IFluidHandle,
	IFluidHandleContext,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import type { IChannel } from "./channel.js";

/**
 * Events emitted by {@link IFluidDataStoreRuntime}.
 * @public
 */
export interface IFluidDataStoreRuntimeEvents extends IEvent {
	(event: "disconnected" | "dispose" | "attaching" | "attached", listener: () => void);
	(event: "op", listener: (message: ISequencedDocumentMessage) => void);
	(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	(event: "connected", listener: (clientId: string) => void);
}

/**
 * Represents the runtime for the data store. Contains helper functions/state of the data store.
 * @public
 */
export interface IFluidDataStoreRuntime
	extends IEventProvider<IFluidDataStoreRuntimeEvents>,
		IDisposable {
	readonly id: string;

	readonly IFluidHandleContext: IFluidHandleContext;

	readonly rootRoutingContext: IFluidHandleContext;
	readonly channelsRoutingContext: IFluidHandleContext;
	readonly objectsRoutingContext: IFluidHandleContext;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly options: Record<string | number, any>;

	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

	readonly clientId: string | undefined;

	readonly connected: boolean;

	readonly logger: ITelemetryBaseLogger;

	/**
	 * Indicates the attachment state of the data store to a host service.
	 */
	readonly attachState: AttachState;

	readonly idCompressor?: IIdCompressor;

	/**
	 * Returns the channel with the given id
	 */
	getChannel(id: string): Promise<IChannel>;

	/**
	 * Invokes the given callback and expects that no ops are submitted
	 * until execution finishes. If an op is submitted, an error will be raised.
	 *
	 * Can be disabled by feature gate `Fluid.ContainerRuntime.DisableOpReentryCheck`
	 *
	 * @param callback - the callback to be invoked
	 */
	ensureNoDataModelChanges<T>(callback: () => T): T;

	/**
	 * Creates a new channel of the given type.
	 * @param id - ID of the channel to be created.  A unique ID will be generated if left undefined.
	 * @param type - Type of the channel.
	 */
	createChannel(id: string | undefined, type: string): IChannel;

	/**
	 * This api allows adding channel to data store after it was created.
	 * This allows callers to cusmomize channel instance. For example, channel implementation
	 * could have various modes of operations. As long as such configuration is provided at creation
	 * and stored in summaries (such that all users of such channel instance behave the same), this
	 * could be useful technique to have customized solutions without introducing a number of data structures
	 * that all have same implementation.
	 * This is also useful for scenarios like SharedTree DDS, where schema is provided at creation and stored in a summary.
	 * The channel type should be present in the registry, otherwise the runtime would reject
	 * the channel. The runtime used to create the channel object should be same to which
	 * it is added.
	 * @param channel - channel which needs to be added to the runtime.
	 */
	addChannel(channel: IChannel): void;

	/**
	 * Bind the channel with the data store runtime. If the runtime
	 * is attached then we attach the channel to make it live.
	 */
	bindChannel(channel: IChannel): void;

	// Blob related calls
	/**
	 * Api to upload a blob of data.
	 * @param blob - blob to be uploaded.
	 */
	uploadBlob(blob: ArrayBufferLike, signal?: AbortSignal): Promise<IFluidHandle<ArrayBufferLike>>;

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	submitSignal(type: string, content: any, targetClientId?: string): void;

	/**
	 * Returns the current quorum.
	 */
	getQuorum(): IQuorumClients;

	/**
	 * Returns the current audience.
	 */
	getAudience(): IAudience;

	/**
	 * Resolves when a local data store is attached.
	 */
	waitAttached(): Promise<void>;

	/**
	 * Exposes a handle to the root object / entryPoint of the data store. Use this as the primary way of interacting
	 * with it.
	 */
	readonly entryPoint: IFluidHandle<FluidObject>;
}
